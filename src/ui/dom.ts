// The page's elements, looked up by id and checked against the type the code expects of them.

/** The element with this id, which must be a `type`; throws when the page has no such element. */
export function byId<T extends HTMLElement>(id: string, type: abstract new (...args: never[]) => T): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) throw new Error(`The page has no ${type.name} #${id}`);
  return element;
}
