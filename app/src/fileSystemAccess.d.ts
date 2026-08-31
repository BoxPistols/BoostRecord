// File System Access API のうち、TypeScript の lib.dom がまだ持っていない分。
// 権限まわり（queryPermission / requestPermission）とピッカーが未収録。
// 仕様: https://wicg.github.io/file-system-access/

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite'
}

interface FileSystemHandle {
  queryPermission(
    descriptor?: FileSystemHandlePermissionDescriptor
  ): Promise<PermissionState>
  requestPermission(
    descriptor?: FileSystemHandlePermissionDescriptor
  ): Promise<PermissionState>
}

interface DirectoryPickerOptions {
  id?: string
  mode?: 'read' | 'readwrite'
  startIn?: FileSystemHandle | string
}

interface SaveFilePickerOptions {
  suggestedName?: string
  types?: { description?: string; accept: Record<string, string[]> }[]
}

interface Window {
  showDirectoryPicker(
    options?: DirectoryPickerOptions
  ): Promise<FileSystemDirectoryHandle>
  showSaveFilePicker(
    options?: SaveFilePickerOptions
  ): Promise<FileSystemFileHandle>
}
