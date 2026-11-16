/** A single portable folder component; shared by the UI and the filesystem boundary. */
export function validProjectFolderName(name: string): boolean {
  return name.length > 0 && name.length <= 120 && name === name.trim()
    && !/[<>:"/\\|?*\u0000-\u001f\u007f]/.test(name)
    && !/[. ]$/.test(name) && name !== '.' && name !== '..'
    && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
}
