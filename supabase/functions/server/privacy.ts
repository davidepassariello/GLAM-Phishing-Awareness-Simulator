// Il mascheramento effettivo verrà introdotto nel passo B2.
export function maskText(text: string): string {
  return text
}

export function stripUrls(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\((?:https?:\/\/|www\.)[^)]+\)/gi, "$1")
    .replace(/\b(?:https?:\/\/|www\.)[^\s<>()]+/gi, "")
    .replace(
      /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|org|net|it|eu|info|biz|io|co|app|dev|example)(?:\/[^\s<>()]*)?/gi,
      "",
    )
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
