function blankRange(chars, start, end) {
  for (let index = start; index < end; index += 1) {
    if (chars[index] !== "\n" && chars[index] !== "\r") {
      chars[index] = " ";
    }
  }
}

export function normalizeJsonc(source) {
  const chars = [...source];
  let inString = false;
  let escaped = false;

  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "/" && chars[index + 1] === "/") {
      let end = index + 2;
      while (end < chars.length && chars[end] !== "\n" && chars[end] !== "\r") {
        end += 1;
      }
      blankRange(chars, index, end);
      index = end - 1;
      continue;
    }

    if (char === "/" && chars[index + 1] === "*") {
      let end = index + 2;
      while (end < chars.length - 1 && !(chars[end] === "*" && chars[end + 1] === "/")) {
        end += 1;
      }
      end = Math.min(chars.length, end + 2);
      blankRange(chars, index, end);
      index = end - 1;
    }
  }

  inString = false;
  escaped = false;
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char !== ",") {
      continue;
    }
    let next = index + 1;
    while (next < chars.length && /\s/u.test(chars[next])) {
      next += 1;
    }
    if (chars[next] === "}" || chars[next] === "]") {
      chars[index] = " ";
    }
  }

  return chars.join("");
}

function positionFromError(error, source) {
  const match = /position\s+(\d+)/iu.exec(error.message);
  if (!match) {
    return {};
  }
  const offset = Number(match[1]);
  const before = source.slice(0, offset);
  const lines = before.split(/\r?\n/u);
  return { line: lines.length, column: lines.at(-1).length + 1 };
}

export function parseJsonc(source) {
  try {
    return { value: JSON.parse(normalizeJsonc(source)) };
  } catch (error) {
    return { error, ...positionFromError(error, source) };
  }
}
