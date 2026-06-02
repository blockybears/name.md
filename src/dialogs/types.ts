export type MessageDialogOptions = {
  okLabel?: string
  message: string
  title?: string
}

export type ConfirmationDialogOptions = {
  cancelLabel?: string
  confirmLabel?: string
  danger?: boolean
  message: string
  title?: string
}

export type TextDialogOptions = {
  cancelLabel?: string
  confirmLabel?: string
  defaultValue?: string
  label: string
  message?: string
  title?: string
}

export type DestinationFolderDialogOptions = {
  cancelLabel?: string
  confirmLabel?: string
  defaultValue?: string
  docsRoot: string
  fileName: string
  folders: string[]
  heading: string
  message: string
  title?: string
}

export type ChoiceDialogOptions = {
  cancelLabel?: string
  choices: Array<{
    label: string
    value: string
    description?: string
  }>
  heading?: string
  message: string
  title?: string
}

export type AppDialogRequest =
  | ({ kind: 'message' } & Required<Pick<MessageDialogOptions, 'message'>> & Omit<MessageDialogOptions, 'message'>)
  | ({ kind: 'confirmation' } & Required<Pick<ConfirmationDialogOptions, 'message'>> &
      Omit<ConfirmationDialogOptions, 'message'>)
  | ({ kind: 'text' } & TextDialogOptions)
  | ({ kind: 'choice' } & ChoiceDialogOptions)
  | ({ kind: 'destinationFolder' } & DestinationFolderDialogOptions)

export type ActiveAppDialogRequest = AppDialogRequest & {
  requestId: number
}

export type DialogResult = boolean | string | null | undefined

export type AppDialogs = {
  choose(options: ChoiceDialogOptions): Promise<string | null>
  requestConfirmation(options: ConfirmationDialogOptions): Promise<boolean>
  requestText(options: TextDialogOptions): Promise<string | null>
  selectDestinationFolder(options: DestinationFolderDialogOptions): Promise<string | null>
  showMessage(options: MessageDialogOptions): Promise<void>
}

export const defaultDialogTitle = 'NAME.md'
