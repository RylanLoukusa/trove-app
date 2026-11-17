// Web links typed or shared into a line.
export type LineLink = { url: string; label: string };

const LINK_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
// Punctuation that ends a sentence rather than a link.
const TRAILING = /[.,;:!?)\]}]+$/;
const MAX_LINKS = 3;

// The links in `text`, in order, each once. A link is shown by its site
// ("example.com"), with the start of its path when the same site appears twice.
export const extractLinks = (text: string): LineLink[] => {
  const urls: string[] = [];
  for (const match of text.match(LINK_PATTERN) ?? []) {
    let raw = match.replace(TRAILING, "");
    // "(see https://a.com/x_(y))" keeps a bracket that belongs to the link.
    if (match.startsWith(raw) && match[raw.length] === ")" && raw.split("(").length > raw.split(")").length) raw += ")";
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    if (!/^https?:\/\/[^/?#]+\.[^/?#]{2,}/i.test(url)) continue;
    if (!urls.includes(url)) urls.push(url);
    if (urls.length >= MAX_LINKS) break;
  }
  const hostOf = (url: string) => url.replace(/^https?:\/\//i, "").split(/[/?#]/)[0].replace(/^www\./i, "");
  const hosts = urls.map(hostOf);
  return urls.map((url, index) => {
    const host = hosts[index];
    const repeated = hosts.filter((other) => other === host).length > 1;
    const path = url.replace(/^https?:\/\//i, "").slice(url.replace(/^https?:\/\//i, "").split(/[/?#]/)[0].length);
    const label = repeated && path.length > 1 ? `${host}${path.length > 18 ? `${path.slice(0, 17)}…` : path}` : host;
    return { url, label };
  });
};
