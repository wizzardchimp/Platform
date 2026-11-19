// The widget bridge only exists in a native iOS build; the web demo does nothing here.
export class ExtensionStorage {
  static reloadWidget(): void {}
  constructor(_appGroup: string) {}
  set(): void {}
}
