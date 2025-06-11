# 🗂️ Todo Aggregator Plugin for Obsidian

**Aggregate all your unchecked `- [ ]` tasks from your entire Obsidian vault into a single dashboard file.**  
Stay on top of your todos without flipping through every note!

## 🚀 Features

- 🧠 Scans all `.md` files in your vault (excluding folders you define).
- ✅ Collects unchecked `- [ ]` style todos.
- 📄 Groups them by file in a single "Todo Dashboard" note.
- ⚡ Uses caching to avoid unnecessary re-processing.
- 🛡️ Skips previously scanned files unless they've changed.
- 🔕 Optionally excludes specific folders like `archive/` or `templates/`.

## 📦 Installation

1. Download or clone the repository.
2. Copy it into your Obsidian vault’s `.obsidian/plugins` directory.
3. Enable **Todo Aggregator** in your Obsidian community plugins settings.

## 🛠️ Usage

You can trigger aggregation in two ways:
- Click the ✅ **"Aggregate Todos"** ribbon icon.
- Run the **"Aggregate Todos"** command via the Command Palette.

This will scan your notes, extract todos, and write them to your defined dashboard file (default: `Todo Dashboard.md`).

## ⚙️ Settings

Accessible via the plugin settings in Obsidian.

- **Target file**  
  The file where aggregated todos will be written.  
  _Example:_ `Todos/Dashboard.md`

- **Exclude folders**  
  Comma-separated list of folder names to skip.  
  _Example:_ `templates,archive`

> 💡 The plugin automatically skips the dashboard file to avoid recursive todos.

## 📋 Output Format

Each file's todos will be grouped like this in your dashboard:

```markdown
## 📄 [[MyNote.md]]
- [ ] Fix the intro section
- [ ] Add diagrams
