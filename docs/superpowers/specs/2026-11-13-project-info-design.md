# Project information card

The sidebar project row exposes a card on delayed hover and through an “项目信息” item in its existing action menu. Keep project expansion, new conversation, and removal behavior. Do not add project editing.

The card shows the project name, full workspace path, total unarchived local conversations, and the five most recently active conversations with dates. Use all tasks for that workspace, independent of sidebar search, excluding remote tasks. Prefer current session titles and activity dates, falling back to task titles and creation dates when summaries are not loaded. Clicking a conversation uses the existing task navigation callback.

Render in a portal outside the scrolling sidebar. Keep the card within the viewport, allow pointer travel into it, and close on outside pointer, Escape, outside scroll, or resize. Only one project card can be open; an explicitly opened or keyboard-focused card suppresses other projects’ hover cards. Explicit menu opening focuses the card; Escape restores the project action trigger. Long names and paths wrap. Empty projects show an empty state. Translate all new interface text.

Validation: component tests for full-project data during search, recent ordering/limit, unloaded summaries, navigation, empty state and dismissal; Electron checks for hover, menu access, light/dark themes and narrow viewport. No new persisted state, backend operations, or model calls.
