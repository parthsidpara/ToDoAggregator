import { App, Plugin, TFile, Notice, PluginSettingTab, Setting } from 'obsidian';

// --- Settings Interface ---
interface TodoAggregatorSettings {
	targetFile: string;
	excludeFolders: string;
}

const DEFAULT_SETTINGS: TodoAggregatorSettings = {
	targetFile: 'Todo Dashboard.md',
	excludeFolders: ''
};

// --- Main Plugin Class ---
export default class TodoAggregatorPlugin extends Plugin {
	settings: TodoAggregatorSettings;

	// In-memory cache mapping file paths to their last modification time and todos
	private todoCache: Map<string, { mtime: number, todos: string[] }> = new Map();

	async onload() {
		await this.loadSettings();

		// Add a ribbon icon to trigger aggregation
		this.addRibbonIcon('file-check', 'Aggregate Todos', async () => {
			await this.aggregateTodos();
		});

		// Add a command to trigger aggregation
		this.addCommand({
			id: 'aggregate-todos',
			name: 'Aggregate Todos',
			callback: async () => {
				await this.aggregateTodos();
			}
		});

		// Add settings tab
		this.addSettingTab(new TodoAggregatorSettingsTab(this.app, this));
	}

	// --- Core Logic: Scan and Aggregate Todos with Caching ---
	async aggregateTodos() {
		const files = this.app.vault.getMarkdownFiles();
		let allTodos: string[] = [];

		// Use a Set to track file paths that are currently processed.
		const currentFilePaths = new Set<string>();

		// console.log('[DEBUG] Starting aggregation. Total files:', files.length);

		for (const file of files) {
			if (this.isExcluded(file.path)) {
				// console.log('[DEBUG] Skipping excluded file:', file.path);
				continue;
			}

			currentFilePaths.add(file.path);
			// console.log('[DEBUG] Processing file:', file.path);

			// Check if we already have cached todos and if the file hasn’t changed.
			const cacheEntry = this.todoCache.get(file.path);
			if (cacheEntry && cacheEntry.mtime === file.stat.mtime) {
				// console.log('[DEBUG] Using cached todos for:', file.path);
				allTodos.push(...cacheEntry.todos);
			} else {
				try {
					const content = await this.app.vault.read(file);
					const todos = this.extractTodos(content, file.path);
					// Update the cache for this file.
					this.todoCache.set(file.path, { mtime: file.stat.mtime, todos });
					allTodos.push(...todos);
					// console.log('[DEBUG] Extracted and cached todos for:', file.path);
				} catch (error) {
					console.error('[ERROR] Failed to read file:', file.path, error);
				}
			}
		}

		// Clean up cache: Remove entries for files that no longer exist.
		for (const cachedFile of this.todoCache.keys()) {
			if (!currentFilePaths.has(cachedFile)) {
				this.todoCache.delete(cachedFile);
			}
		}

		// console.log('[DEBUG] Total todos aggregated:', allTodos.length);

		// Save todos and check for differences.
		const result = await this.saveTodosToFile(allTodos);

		if (result.contentChanged) {
			let message = `🎉 Todo Dashboard Updated\n\n`;
			message += `File: ${this.settings.targetFile}\n`;
			if (result.added > 0) {
				message += `- ➕ Added: ${result.added} new todo${result.added > 1 ? 's' : ''}\n`;
			}
			if (result.removed > 0) {
				message += `- ➖ Removed: ${result.removed} todo${result.removed > 1 ? 's' : ''}\n`;
			}
			new Notice(message);
		} else {
			new Notice(`✅ No Changes Detected!\nYour todos are up-to-date!`);
		}
	}



	// --- Check if file is in excluded folders ---
	isExcluded(filePath: string): boolean {
		// Always exclude the target file itself
		if (filePath === this.settings.targetFile) return true;

		// Skip if no folders are excluded
		if (!this.settings.excludeFolders) return false;

		const excludeFolders = this.settings.excludeFolders
			.split(',')
			.map(f => f.trim())
			.filter(f => f !== '');

		return excludeFolders.some(folder => {
			const normalizedFolder = folder.endsWith('/') ? folder : folder + '/';
			return filePath.startsWith(normalizedFolder);
		});
	}

	// --- Extract todos with regex ---
	extractTodos(content: string, filePath: string): string[] {
		const todoRegex = /^\s*-\s*\[\s*\]\s*(.+?)\s*$/gmi;
		const todos: string[] = [];
		let match;

		while ((match = todoRegex.exec(content)) !== null) {
			const todoText = match[1].trim();
			// Skip empty todos
			if (todoText.length > 0) {
				todos.push(`- [ ] ${todoText} (from [[${filePath}]])`);
			}
		}

		return todos;
	}

	// --- Save todos to target file ---
	async saveTodosToFile(newTodos: string[]): Promise<{ contentChanged: boolean, added: number, removed: number }> {
		const targetFile = this.app.vault.getAbstractFileByPath(this.settings.targetFile);
		let contentChanged = false;
		let added = 0;
		let removed = 0;

		// Group todos by file (rebuild the content as before)
		const grouped: { [filePath: string]: string[] } = {};
		for (const todo of newTodos) {
			const fileMatch = todo.match(/\(from \[\[(.+?)\]\]\)/);
			if (fileMatch) {
				const filePath = fileMatch[1];
				if (!grouped[filePath]) grouped[filePath] = [];
				// Remove the file reference for the final output
				const todoText = todo.replace(/\(from \[\[.+?\]\]\)/, '').trim();
				grouped[filePath].push(todoText);
			}
		}

		let newContent = '\n';
		for (const [filePath, todos] of Object.entries(grouped)) {
			newContent += `## 📄 [[${filePath}]]\n${todos.join('\n')}\n\n`;
		}
		// Normalize the new content
		newContent = newContent.trim() + '\n';

		// A helper function to extract todo lines from content
		const extractTodoLines = (content: string): string[] => {
			return content.split('\n').filter(line => line.startsWith('- [ ]'));
		};

		if (!targetFile) {
			// If the target file doesn't exist, create it.
			await this.app.vault.create(this.settings.targetFile, newContent);
			contentChanged = true;
			// All todos are “new”
			added = extractTodoLines(newContent).length;
		} else {
			const existingContent = await this.app.vault.read(targetFile as TFile);
			const existingNormalized = existingContent.trim() + '\n';
			const newNormalized = newContent.trim() + '\n';

			const oldTodos = extractTodoLines(existingNormalized);
			const newTodoLines = extractTodoLines(newNormalized);

			// Compute differences
			const addedTodos = newTodoLines.filter(todo => !oldTodos.includes(todo));
			const removedTodos = oldTodos.filter(todo => !newTodoLines.includes(todo));
			added = addedTodos.length;
			removed = removedTodos.length;

			// If the content is different, update the file.
			if (existingNormalized !== newNormalized) {
				await this.app.vault.modify(targetFile as TFile, newContent);
				contentChanged = true;
			}
		}

		return { contentChanged, added, removed };
	}


	// --- Settings Management ---
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

// --- Settings Tab Class ---
class TodoAggregatorSettingsTab extends PluginSettingTab {
	plugin: TodoAggregatorPlugin;

	constructor(app: App, plugin: TodoAggregatorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		// Target file setting
		new Setting(containerEl)
			.setName('Target file')
			.setDesc('Path to the aggregated todo file (e.g., "Todos/Dashboard.md")')
			.addText(text => text
				.setPlaceholder('Todo Dashboard.md')
				.setValue(this.plugin.settings.targetFile)
				.onChange(async (value) => {
					this.plugin.settings.targetFile = value;
					await this.plugin.saveSettings();
				}));

		// Excluded folders setting
		new Setting(containerEl)
			.setName('Exclude folders')
			.setDesc('Comma-separated list of folders to exclude (e.g., "templates,archive")')
			.addText(text => text
				.setPlaceholder('templates,archive')
				.setValue(this.plugin.settings.excludeFolders)
				.onChange(async (value) => {
					this.plugin.settings.excludeFolders = value;
					await this.plugin.saveSettings();
				}));
	}
}