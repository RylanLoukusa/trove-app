// Someone a line on a shared list can be given to. `name` is their own name
// (shown as "Me" to themselves).
export type ListPerson = { id: string; name: string; isMe: boolean };

export const personLabel = (person: Pick<ListPerson, "name" | "isMe">): string => (person.isMe ? "Me" : person.name);

// What a line given to someone says about it: "Me", their name, or the name
// it was given under when they're not among the list's people any more.
export const assigneeLabel = (
  entry: { assigneeId?: string; assigneeName?: string },
  people: ListPerson[],
  myId?: string,
): string | null => {
  if (!entry.assigneeId) return null;
  if (myId && entry.assigneeId === myId) return "Me";
  const person = people.find((candidate) => candidate.id === entry.assigneeId);
  return person ? personLabel(person) : entry.assigneeName ?? "Someone";
};
