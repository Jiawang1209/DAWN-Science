# Context return QA

User-visible acceptance:
- Return opens the same native Agent session ID in the main view; old user/agent turns and tool results are visible, and a graphical follow-up is stored on that same ID. No task/message copy is created.
- CLI remains attached while the GUI is used; reopening the terminal in the same project reuses the original PTY. Normal keeps the most recent CLI target; an untouched Normal terminal restores its original conversation/draft.
- Original conversation draft and Shell survive; multiple live terminals choose their own targets. Returning during a tool run does not abort it. CLI launched from a child directory returns to that task's project/workspace.
- Removed targets show an explicit notice and leave terminal visible. Mode transitions are refused with a short message; asynchronous return checks terminal, owner, project and view before navigation. Requests never navigate after the user leaves the initiating scope.
- GUI selection comes from the active runtime when available and from the CLI's last selection when it has stopped; it does not merely display the agent's configured default.
- Real-model semantic check: a random marker appears only in a terminal user turn; after clicking Return, ask for it without repeating it. Compare final answer and session IDs. Also verify recall after Normal/resume, original draft, task count and Shell PID.
- Visual inspection: terminal return control and resulting GUI at 1280×840 light and 1000×720 dark, original process remains, no second conversation composer.
- Scope: no image feature, no merge, push or installed-app replacement, existing credential source read only, main clean.
