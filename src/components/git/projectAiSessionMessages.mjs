export const sortMessagesNewestFirst = (messages = []) => {
  if (!Array.isArray(messages) || messages.length <= 1) {
    return Array.isArray(messages) ? [...messages] : []
  }

  return [...messages].reverse()
}
