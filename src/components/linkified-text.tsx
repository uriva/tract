import { Fragment } from "react";

const urlSplit = /(https?:\/\/[^\s]+)/g;
const isUrl = (s: string) => /^https?:\/\/[^\s]+$/.test(s);

/**
 * Render plain text with any http(s) URLs turned into clickable links. Used for
 * comment bodies so Tract (and users) can drop links (e.g. to a pull request)
 * and have them work, without any special parsing of the message content.
 */
export function LinkifiedText({ text }: { text: string }) {
  const parts = text.split(urlSplit);
  return (
    <>
      {parts.map((part, i) =>
        isUrl(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2 hover:opacity-80 break-all"
          >
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
