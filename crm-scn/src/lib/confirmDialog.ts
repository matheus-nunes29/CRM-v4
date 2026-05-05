type ConfirmOptions = {
  title: string
  message?: string
  confirmLabel?: string
  danger?: boolean
}
type Listener = (options: ConfirmOptions, resolve: (result: boolean) => void) => void

let _listener: Listener | null = null

export const confirmDialog = {
  show: (options: ConfirmOptions): Promise<boolean> => {
    if (!_listener) return Promise.resolve(false)
    return new Promise(resolve => _listener!(options, resolve))
  },
  _register:   (fn: Listener) => { _listener = fn },
  _unregister: ()             => { _listener = null },
}
