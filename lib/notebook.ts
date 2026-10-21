// Read old notes as one document without modifying or deleting their records.
export function notebookBody(folder: { body?: string }, notes: { title: string; body: string; createdAt: number }[]) {
  if (folder.body !== undefined) return folder.body;
  return [...notes].sort((a, b) => a.createdAt - b.createdAt).map(note =>
    note.title.trim() === note.body.trim() ? note.body : [note.title, note.body].filter(Boolean).join('\n'),
  ).join('\n\n');
}
