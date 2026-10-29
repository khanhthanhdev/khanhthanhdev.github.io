// Interactive figures for the "RSA, step by step" post.
// Plain DOM and BigInt arithmetic, no framework. The figures share one key: the key generator sets it,
// the encrypt and crack figures use it. Each figure mounts lazily when it nears the viewport.
(function () {
  "use strict";

  function h(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value);
    }
    node.append(...children);
    return node;
  }

  // Groups digits in threes with thin spaces, so long numbers stay readable.
  const fmt = (v) => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const bits = (v) => v.toString(2).length;

  // Accepts digits with optional spaces, commas or underscores. Returns a BigInt or null.
  function parseBig(text) {
    const clean = String(text).replace(/[\s,_ ]/g, "");
    return /^\d+$/.test(clean) ? BigInt(clean) : null;
  }

  /* ------------------------------------------------------------ number theory */

  const mod = (a, m) => ((a % m) + m) % m;

  function gcd(a, b) {
    while (b) [a, b] = [b, a % b];
    return a;
  }

  // Euclid's algorithm, one row per division: a = q·b + r.
  function gcdSteps(a, b) {
    const rows = [];
    while (b) {
      rows.push({ a, b, q: a / b, r: a % b });
      [a, b] = [b, a % b];
    }
    return { gcd: a, rows };
  }

  // Extended Euclid for the inverse of e mod phi. Each row keeps the invariant r ≡ t·e (mod phi),
  // so the row where r reaches 1 holds the inverse in its t column.
  function inverseSteps(e, phi) {
    const rows = [
      { q: null, r: phi, t: 0n },
      { q: null, r: e, t: 1n },
    ];
    while (rows[rows.length - 1].r !== 0n) {
      const prev = rows[rows.length - 2];
      const cur = rows[rows.length - 1];
      const q = prev.r / cur.r;
      rows.push({ q, r: prev.r - q * cur.r, t: prev.t - q * cur.t });
    }
    const last = rows[rows.length - 2];
    return { rows, ok: last.r === 1n, t: last.t, d: last.r === 1n ? mod(last.t, phi) : null };
  }

  // Left-to-right square-and-multiply, one row per bit of the exponent.
  function powSteps(base, exp, n) {
    const rows = [];
    let x = 1n;
    base = mod(base, n);
    for (const bit of exp.toString(2)) {
      const sq = (x * x) % n;
      x = bit === "1" ? (sq * base) % n : sq;
      rows.push({ bit, from: rows.length ? rows[rows.length - 1].x : 1n, sq, x });
    }
    return { result: x, rows };
  }

  function modPow(base, exp, n) {
    let result = 1n;
    base = mod(base, n);
    while (exp > 0n) {
      if (exp & 1n) result = (result * base) % n;
      base = (base * base) % n;
      exp >>= 1n;
    }
    return result;
  }

  const SMALL_PRIMES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];

  // Miller–Rabin with the first twelve primes as bases, which is exact for every n below 3.3·10^24.
  function isPrime(n) {
    if (n < 2n) return false;
    for (const p of SMALL_PRIMES) {
      if (n === p) return true;
      if (n % p === 0n) return false;
    }
    let d = n - 1n;
    let s = 0;
    while ((d & 1n) === 0n) {
      d >>= 1n;
      s++;
    }
    outer: for (const a of SMALL_PRIMES) {
      let x = modPow(a, d, n);
      if (x === 1n || x === n - 1n) continue;
      for (let i = 1; i < s; i++) {
        x = (x * x) % n;
        if (x === n - 1n) continue outer;
      }
      return false;
    }
    return true;
  }

  // Smallest factor found by trial division up to `limit`, or null.
  function smallFactor(n, limit = 200000n) {
    if (n % 2n === 0n) return 2n;
    for (let f = 3n; f <= limit && f * f <= n; f += 2n) if (n % f === 0n) return f;
    return null;
  }

  function randomBelow(range) {
    const bytes = new Uint8Array(Math.ceil(range.toString(16).length / 2) + 8);
    crypto.getRandomValues(bytes);
    let v = 0n;
    for (const b of bytes) v = (v << 8n) | BigInt(b);
    return v % range;
  }

  function randomPrime(digits, avoid = 0n) {
    const lo = 10n ** BigInt(digits - 1);
    const hi = 10n ** BigInt(digits);
    for (;;) {
      let c = lo + randomBelow(hi - lo);
      if (c < 3n) c = 3n;
      if (c % 2n === 0n) c += 1n;
      while (c < hi && !isPrime(c)) c += 2n;
      if (c < hi && c !== avoid) return c;
    }
  }

  // The exponent we suggest when the reader's choice doesn't work: 65537 if it fits, else the smallest that does.
  function pickE(phi) {
    if (65537n < phi && gcd(65537n, phi) === 1n) return 65537n;
    for (let e = 3n; e < phi; e += 2n) if (gcd(e, phi) === 1n) return e;
    return null;
  }

  function suggestEs(phi) {
    const out = [];
    for (const e of [3n, 5n, 7n, 11n, 13n, 17n, 257n, 65537n]) {
      if (e < phi && gcd(e, phi) === 1n) out.push(e);
    }
    return out;
  }

  /* ------------------------------------------------------------ the shared key */

  const shared = { key: null, listeners: [] };

  function makeKey(p, q, e) {
    const n = p * q;
    const phi = (p - 1n) * (q - 1n);
    return { p, q, e, n, phi, d: inverseSteps(e, phi).d };
  }

  function setKey(key) {
    shared.key = key;
    shared.listeners.forEach((fn) => fn(key));
  }

  function onKey(fn) {
    shared.listeners.push(fn);
    fn(shared.key);
  }

  shared.key = makeKey(61n, 53n, 17n);

  /* ------------------------------------------------------------ shared bits of UI */

  function field(label, value, opts = {}) {
    const input = h("input", {
      class: "rsa-input",
      type: "text",
      inputmode: "numeric",
      autocomplete: "off",
      spellcheck: "false",
      value: String(value),
      "aria-label": opts.aria || label,
    });
    if (opts.wide) input.classList.add("is-wide");
    const wrap = h("label", { class: "rsa-field" }, h("span", { class: "rsa-label", text: label }), input);
    return { wrap, input };
  }

  function table(head, rows, opts = {}) {
    const t = h(
      "table",
      { class: "rsa-table" },
      h("thead", {}, h("tr", {}, ...head.map((c) => h("th", { scope: "col", text: c })))),
      h(
        "tbody",
        {},
        ...rows.map((r) => {
          const tr = h("tr", {}, ...r.cells.map((c) => (c instanceof Node ? h("td", {}, c) : h("td", { text: c }))));
          if (r.key) tr.className = "is-key";
          if (r.muted) tr.classList.add("is-muted");
          return tr;
        })
      )
    );
    const box = h("div", { class: "rsa-table-wrap", tabindex: "0", role: "region", "aria-label": opts.label || "steps" }, t);
    if (opts.tall) box.classList.add("is-tall");
    return box;
  }

  function step(num, title, ...body) {
    return h(
      "li",
      { class: "rsa-step" },
      h("div", { class: "rsa-step-head" }, h("span", { class: "rsa-num", text: num }), h("span", { class: "rsa-step-title", text: title })),
      h("div", { class: "rsa-step-body" }, ...body)
    );
  }

  const line = (...parts) => h("p", { class: "rsa-line" }, ...parts);
  const mono = (text, cls = "") => h("span", { class: `rsa-mono ${cls}`.trim(), text: String(text) });
  const ok = (text) => h("span", { class: "rsa-ok", text: `✓ ${text}` });
  const bad = (text) => h("span", { class: "rsa-bad", text: `✗ ${text}` });

  // Superscript power as DOM: base^exp mod n
  const power = (base, exp, n) =>
    h("span", { class: "rsa-mono" }, `${fmt(base)}`, h("sup", { text: String(exp) }), ` mod ${fmt(n)}`);

  function powTable(base, exp, n, label) {
    const { rows } = powSteps(base, exp, n);
    return table(
      ["bit", "square", "× base?", "running value"],
      rows.map((r) => ({
        cells: [
          r.bit,
          `${fmt(r.from)}² mod n = ${fmt(r.sq)}`,
          r.bit === "1" ? `${fmt(r.sq)} × ${fmt(mod(base, n))} mod n` : "—",
          fmt(r.x),
        ],
        muted: r.bit === "0",
      })),
      { label, tall: rows.length > 12 }
    );
  }

  /* ------------------------------------------------------------ figure 1: key generation */

  function mountKeygen(root) {
    root.replaceChildren();
    const p = field("p", "61", { aria: "first prime p" });
    const q = field("q", "53", { aria: "second prime q" });
    const e = field("e", "17", { aria: "public exponent e" });

    let digits = 3;
    const sizes = [2, 3, 4, 6, 9];
    const seg = h(
      "span",
      { class: "rsa-seg", role: "group", "aria-label": "prime size in digits" },
      ...sizes.map((d) =>
        h("button", {
          type: "button",
          text: `${d}`,
          "aria-pressed": String(d === digits),
          onclick: (ev) => {
            digits = d;
            seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === ev.currentTarget)));
          },
        })
      )
    );

    const randomBtn = h("button", {
      type: "button",
      class: "rsa-btn rsa-btn-primary",
      text: "Random primes",
      onclick: () => {
        const pv = randomPrime(digits);
        const qv = randomPrime(digits, pv);
        p.input.value = String(pv);
        q.input.value = String(qv);
        const phi = (pv - 1n) * (qv - 1n);
        const ev = parseBig(e.input.value);
        if (!ev || ev <= 1n || ev >= phi || gcd(ev, phi) !== 1n) e.input.value = String(pickE(phi));
        render();
      },
    });
    const resetBtn = h("button", {
      type: "button",
      class: "rsa-btn",
      text: "Reset",
      onclick: () => {
        p.input.value = "61";
        q.input.value = "53";
        e.input.value = "17";
        render();
      },
    });

    const steps = h("ol", { class: "rsa-steps", "aria-live": "polite" });
    root.append(
      h("span", { class: "rsa-label", text: "Make a key pair" }),
      h("span", { class: "rsa-sub", text: "Type your own primes and exponent, or roll random ones. Every step updates as you type." }),
      h("div", { class: "rsa-toolbar" }, p.wrap, q.wrap, e.wrap),
      h(
        "div",
        { class: "rsa-toolbar" },
        h("span", { class: "rsa-field" }, h("span", { class: "rsa-label", text: "digits" }), seg),
        randomBtn,
        resetBtn
      ),
      steps
    );

    function primeLine(name, v) {
      if (v === null) return line(mono(name), " = ", bad("type a whole number"));
      if (v > 10n ** 18n) return line(mono(name), " = ", mono(fmt(v)), " ", bad("keep it below 19 digits for this demo"));
      if (isPrime(v)) return line(mono(name), " = ", mono(fmt(v)), " ", ok("prime"));
      if (v < 2n) return line(mono(name), " = ", mono(fmt(v)), " ", bad("primes start at 2"));
      const f = smallFactor(v);
      return line(
        mono(name),
        " = ",
        mono(fmt(v)),
        " ",
        bad(f ? `not prime: ${fmt(v)} = ${fmt(f)} × ${fmt(v / f)}` : "not prime (fails the Miller–Rabin test)")
      );
    }

    function render() {
      const pv = parseBig(p.input.value);
      const qv = parseBig(q.input.value);
      const ev = parseBig(e.input.value);
      const out = [];
      const stale = () =>
        h("p", { class: "rsa-note", text: "Fix the step above to continue. The figures further down keep using the last valid key." });

      // 1. primes
      const primesOk = pv !== null && qv !== null && pv <= 10n ** 18n && qv <= 10n ** 18n && isPrime(pv) && isPrime(qv);
      const s1 = step("01", "Pick two secret primes", primeLine("p", pv), primeLine("q", qv));
      if (primesOk && pv === qv) s1.lastChild.append(line(bad("p and q must be different, or n is a perfect square and easy to undo")));
      out.push(s1);
      if (!primesOk || pv === qv) {
        out.push(stale());
        steps.replaceChildren(...out);
        return;
      }

      // 2. n
      const n = pv * qv;
      out.push(
        step(
          "02",
          "Multiply them to get the modulus n",
          line(mono(`n = p × q = ${fmt(pv)} × ${fmt(qv)} = `), mono(fmt(n), "is-key")),
          h("p", { class: "rsa-note", text: `n is ${bits(n)} bits long. It goes in the public key; p and q stay secret.` })
        )
      );

      // 3. phi
      const phi = (pv - 1n) * (qv - 1n);
      out.push(
        step(
          "03",
          "Compute φ(n) = (p − 1)(q − 1)",
          line(mono(`φ(n) = ${fmt(pv - 1n)} × ${fmt(qv - 1n)} = `), mono(fmt(phi), "is-key")),
          h("p", { class: "rsa-note", text: "This counts the numbers below n that share no factor with it. Only someone who knows p and q can work it out quickly." })
        )
      );

      // 4. e
      const s4 = step("04", "Choose a public exponent e with gcd(e, φ) = 1");
      out.push(s4);
      const body4 = s4.lastChild;
      const eRange = ev !== null && ev > 1n && ev < phi;
      if (!eRange) {
        body4.append(line(mono("e"), " = ", mono(ev === null ? "?" : fmt(ev)), " ", bad(`e must be a whole number with 1 < e < ${fmt(phi)}`)));
      } else {
        const g = gcdSteps(phi, ev);
        body4.append(
          table(
            ["a", "b", "a = q·b + r", "r"],
            g.rows.map((r) => ({ cells: [fmt(r.a), fmt(r.b), `${fmt(r.a)} = ${fmt(r.q)} × ${fmt(r.b)} + ${fmt(r.r)}`, fmt(r.r)] })),
            { label: "Euclid's algorithm for gcd(φ, e)", tall: g.rows.length > 12 }
          ),
          line(
            mono(`gcd(${fmt(phi)}, ${fmt(ev)}) = ${fmt(g.gcd)}`),
            " ",
            g.gcd === 1n ? ok("coprime, so e works") : bad(`they share the factor ${fmt(g.gcd)}, so e has no inverse`)
          )
        );
      }
      const eOk = eRange && gcd(phi, ev) === 1n;
      if (!eOk) {
        const picks = suggestEs(phi);
        if (picks.length) {
          body4.append(
            h(
              "p",
              { class: "rsa-line" },
              "Try one of these: ",
              ...picks.map((v) =>
                h("button", {
                  type: "button",
                  class: "rsa-chip",
                  text: fmt(v),
                  onclick: () => {
                    e.input.value = String(v);
                    render();
                  },
                })
              )
            )
          );
        }
        out.push(stale());
        steps.replaceChildren(...out);
        return;
      }

      // 5. d
      const inv = inverseSteps(ev, phi);
      const keyRow = inv.rows.findIndex((r) => r.r === 1n);
      const k = (ev * inv.d - 1n) / phi;
      out.push(
        step(
          "05",
          "Find the private exponent d = e⁻¹ mod φ",
          h("p", {
            class: "rsa-note",
            text: "Extended Euclid: each row is the row two above minus q times the row above. Every row keeps r ≡ t × e (mod φ), so when r reaches 1, t is the inverse.",
          }),
          table(
            ["row", "q", "r", "t"],
            inv.rows.map((r, i) => ({
              cells: [String(i), r.q === null ? "—" : fmt(r.q), fmt(r.r), fmt(r.t)],
              key: i === keyRow,
              muted: r.r === 0n,
            })),
            { label: "extended Euclid table", tall: inv.rows.length > 12 }
          ),
          line(
            mono(inv.t < 0n ? `t = ${fmt(inv.t)}, and ${fmt(inv.t)} + ${fmt(phi)} = ` : "d = "),
            mono(fmt(inv.d), "is-key")
          ),
          line(
            mono(`e × d = ${fmt(ev)} × ${fmt(inv.d)} = ${fmt(ev * inv.d)} = ${fmt(k)} × ${fmt(phi)} + 1`),
            " ",
            ok("e × d ≡ 1 (mod φ)")
          )
        )
      );

      // the key pair
      out.push(
        h(
          "li",
          { class: "rsa-keys" },
          h(
            "div",
            { class: "rsa-key is-public" },
            h("span", { class: "rsa-label", text: "Public key · share it" }),
            line(mono(`n = ${fmt(n)}`)),
            line(mono(`e = ${fmt(ev)}`))
          ),
          h(
            "div",
            { class: "rsa-key is-private" },
            h("span", { class: "rsa-label", text: "Private key · keep it" }),
            line(mono(`d = ${fmt(inv.d)}`)),
            line(mono(`p = ${fmt(pv)}, q = ${fmt(qv)}`))
          )
        )
      );
      steps.replaceChildren(...out);

      const cur = shared.key;
      if (!cur || cur.n !== n || cur.e !== ev || cur.p !== pv) setKey({ p: pv, q: qv, e: ev, n, phi, d: inv.d });
    }

    [p, q, e].forEach((f) => f.input.addEventListener("input", render));
    render();
  }

  /* ------------------------------------------------------------ figure 2: encrypt and decrypt */

  function mountCrypt(root) {
    root.replaceChildren();
    let mode = "number";
    let key = shared.key;

    const keyLine = h("p", { class: "rsa-keyline" });
    const seg = h(
      "span",
      { class: "rsa-seg", role: "group", "aria-label": "message type" },
      ...["number", "text"].map((m) =>
        h("button", {
          type: "button",
          text: m,
          "aria-pressed": String(m === mode),
          onclick: () => {
            mode = m;
            seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.textContent === m)));
            render();
          },
        })
      )
    );

    const msg = field("message m", "65", { aria: "message number m" });
    const cipher = field("ciphertext c", "", { aria: "ciphertext c to decrypt" });
    const text = field("text", "HELLO", { aria: "text message", wide: true });
    text.input.removeAttribute("inputmode");
    text.input.maxLength = 40;

    const body = h("div", { "aria-live": "polite" });
    root.append(
      h("span", { class: "rsa-label", text: "Encrypt, then decrypt" }),
      h("span", { class: "rsa-sub", text: "Uses the key from the generator above. Change the key there and this updates." }),
      keyLine,
      h("div", { class: "rsa-toolbar" }, h("span", { class: "rsa-field" }, h("span", { class: "rsa-label", text: "message" }), seg)),
      body
    );

    // When m changes, the ciphertext box follows it; once the reader edits c by hand, it stays theirs until m changes.
    msg.input.addEventListener("input", () => {
      cipher.input.dataset.auto = "true";
      render();
    });
    cipher.input.addEventListener("input", () => {
      cipher.input.dataset.auto = "false";
      render();
    });
    text.input.addEventListener("input", () => render());
    cipher.input.dataset.auto = "true";

    function renderNumber() {
      const m = parseBig(msg.input.value);
      const enc = h("section", { class: "rsa-panel" }, h("span", { class: "rsa-label", text: "Encrypt with the public key" }));
      const dec = h("section", { class: "rsa-panel" }, h("span", { class: "rsa-label", text: "Decrypt with the private key" }));
      body.replaceChildren(h("div", { class: "rsa-toolbar" }, msg.wrap), enc, h("div", { class: "rsa-toolbar" }, cipher.wrap), dec);

      if (m === null || m >= key.n) {
        enc.append(line(bad(`m must be a whole number from 0 to ${fmt(key.n - 1n)} (smaller than n)`)));
      } else {
        const c = modPow(m, key.e, key.n);
        if (cipher.input.dataset.auto === "true") cipher.input.value = String(c);
        enc.append(
          line(mono("c = m"), h("sup", { class: "rsa-mono", text: "e" }), mono(" mod n = "), power(m, key.e, key.n)),
          h("p", { class: "rsa-note", text: `e = ${fmt(key.e)} is ${key.e.toString(2)} in binary. Read it left to right: square every step, and also multiply by m when the bit is 1.` }),
          powTable(m, key.e, key.n, "square and multiply for encryption"),
          line(mono("c = "), mono(fmt(c), "is-key"))
        );
      }

      const c = parseBig(cipher.input.value);
      if (c === null || c >= key.n) {
        dec.append(line(bad(`c must be a whole number below n = ${fmt(key.n)}`)));
        return;
      }
      const back = modPow(c, key.d, key.n);
      dec.append(
        line(mono("m = c"), h("sup", { class: "rsa-mono", text: "d" }), mono(" mod n = "), power(c, key.d, key.n)),
        h("p", { class: "rsa-note", text: `d has ${bits(key.d)} bits, so this takes ${bits(key.d)} squarings, never ${fmt(key.d)} multiplications.` }),
        powTable(c, key.d, key.n, "square and multiply for decryption"),
        line(
          mono("m = "),
          mono(fmt(back), "is-key"),
          " ",
          m !== null && m < key.n
            ? back === m
              ? ok("the original message")
              : h("span", { class: "rsa-note", text: "(you changed c, so this is a different message)" })
            : ""
        )
      );
    }

    function renderText() {
      body.replaceChildren(h("div", { class: "rsa-toolbar" }, text.wrap));
      if (key.n <= 255n) {
        body.append(
          line(bad(`n = ${fmt(key.n)} is too small: each byte is a number up to 255, and m must be smaller than n. Pick bigger primes above.`))
        );
        return;
      }
      const bytes = Array.from(new TextEncoder().encode(text.input.value));
      if (!bytes.length) {
        body.append(line(h("span", { class: "rsa-note", text: "Type something to encrypt." })));
        return;
      }
      const cs = bytes.map((b) => modPow(BigInt(b), key.e, key.n));
      const backs = cs.map((c) => Number(modPow(c, key.d, key.n)));
      const seen = new Map();
      bytes.forEach((b) => seen.set(b, (seen.get(b) || 0) + 1));
      const chars = bytes.map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : "·"));

      body.append(
        h("p", { class: "rsa-note", text: "The text becomes bytes (UTF-8), and each byte is encrypted on its own as a number m." }),
        table(
          ["char", "byte m", `c = m^${fmt(key.e)} mod n`, "c^d mod n"],
          bytes.map((b, i) => ({ cells: [chars[i], String(b), fmt(cs[i]), String(backs[i])], key: seen.get(b) > 1 })),
          { label: "byte by byte encryption", tall: bytes.length > 12 }
        ),
        h("span", { class: "rsa-label", text: "What travels over the wire" }),
        h("p", { class: "rsa-wire", text: cs.map(String).join(" ") }),
        line(
          mono("decrypted: "),
          mono(new TextDecoder().decode(new Uint8Array(backs)), "is-key"),
          " ",
          backs.every((b, i) => b === bytes[i]) ? ok("matches") : bad("mismatch")
        )
      );
      if ([...seen.values()].some((v) => v > 1)) {
        body.append(
          h("p", {
            class: "rsa-warn",
            text: "Highlighted rows repeat a byte, and they encrypt to the same number every time. An eavesdropper can count them just like letters in a newspaper puzzle. This is why real RSA never encrypts text this way: see the padding section below.",
          })
        );
      }
    }

    function render() {
      keyLine.replaceChildren(
        "Public key ",
        mono(`(n = ${fmt(key.n)}, e = ${fmt(key.e)})`),
        " · private key ",
        mono(`d = ${fmt(key.d)}`)
      );
      if (mode === "number") renderNumber();
      else renderText();
    }

    onKey((k) => {
      key = k;
      cipher.input.dataset.auto = "true";
      // keep the default message in range when the key shrinks
      const m = parseBig(msg.input.value);
      if (m !== null && m >= key.n) msg.input.value = String(key.n > 65n ? 65n : 2n);
      render();
    });
  }

  /* ------------------------------------------------------------ figure 3: cracking by factoring */

  function mountCrack(root) {
    root.replaceChildren();
    const nField = field("n", "", { aria: "public modulus n", wide: true });
    const eField = field("e", "", { aria: "public exponent e" });
    let job = null;

    const runBtn = h("button", { type: "button", class: "rsa-btn rsa-btn-primary", text: "Factor n", onclick: () => (job ? stop() : start()) });
    const useKey = h("button", { type: "button", class: "rsa-btn", text: "Use the key above", onclick: () => loadKey(shared.key) });
    const status = h("p", { class: "rsa-stats", "aria-live": "polite" });
    const result = h("div", { "aria-live": "polite" });

    root.append(
      h("span", { class: "rsa-label", text: "Play the attacker" }),
      h("span", { class: "rsa-sub", text: "You see only the public key. Find p and q by trying every odd divisor up to √n, then rebuild d." }),
      h("div", { class: "rsa-toolbar" }, nField.wrap, eField.wrap),
      h("div", { class: "rsa-toolbar" }, runBtn, useKey),
      status,
      result
    );

    function loadKey(k) {
      stop();
      nField.input.value = String(k.n);
      eField.input.value = String(k.e);
      status.textContent = "";
      result.replaceChildren();
    }

    function stop() {
      if (job) job.cancelled = true;
      job = null;
      runBtn.textContent = "Factor n";
    }

    function isqrt(n) {
      if (n < 2n) return n;
      let x = BigInt(Math.floor(Math.sqrt(Number(n))));
      while (x * x > n) x--;
      while ((x + 1n) * (x + 1n) <= n) x++;
      return x;
    }

    // Divisions per second with BigInt, the arithmetic any real-sized n needs. Runs for about 150 ms.
    function calibrate() {
      const n = 10n ** 29n + 7n;
      let f = 3n;
      let count = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < 150) {
        for (let i = 0; i < 1024; i++, count++, f += 2n) if (n % f === 0n) f = 3n;
      }
      return count / ((performance.now() - t0) / 1000);
    }

    function duration(log10s) {
      const s = 10 ** log10s;
      if (s < 1) return "under a second";
      if (s < 120) return `${Math.round(s)} seconds`;
      if (s < 7200) return `${Math.round(s / 60)} minutes`;
      if (s < 172800) return `${Math.round(s / 3600)} hours`;
      if (s < 63115200) return `${Math.round(s / 86400)} days`;
      const years = log10s - Math.log10(31557600);
      if (years < 6) return `${fmt(Math.round(10 ** years))} years`;
      return `about 10^${Math.round(years)} years`;
    }

    // How long trial division would take on bigger keys: about √n / 2 odd divisors, at the given speed.
    function estimate(rate) {
      const rows = [64, 128, 512, 2048].map((b) => {
        const log10s = (b / 2 - 1) * Math.log10(2) - Math.log10(rate);
        return { cells: [`${b}-bit n`, duration(log10s)], key: b === 2048 };
      });
      return table(["key size", "trial division at this speed"], rows, { label: "time estimates" });
    }

    function start() {
      const n = parseBig(nField.input.value);
      const e = parseBig(eField.input.value);
      result.replaceChildren();
      if (n === null || n < 4n) {
        status.textContent = "Type a whole number n of at least 4.";
        return;
      }
      if (n > 10n ** 30n) {
        status.textContent = "That n is too big for trial division in a browser tab. That is the point: stick to 30 digits or fewer here.";
        return;
      }
      const limit = isqrt(n);
      const small = n <= BigInt(Number.MAX_SAFE_INTEGER);
      const nNum = Number(n);
      const limNum = Number(limit);
      const t0 = performance.now();
      let tried = 0;
      let f = 3n;
      let fNum = 3;
      const me = { cancelled: false };
      job = me;
      runBtn.textContent = "Stop";

      const even = n % 2n === 0n;
      const finish = (factor) => {
        stop();
        const ms = performance.now() - t0;
        const rate = tried / Math.max(ms / 1000, 1e-3);
        status.textContent = `${fmt(tried)} divisions in ${ms < 1000 ? `${ms.toFixed(0)} ms` : `${(ms / 1000).toFixed(1)} s`} (about ${fmt(Math.round(rate))} per second).`;
        if (!factor) {
          result.append(line(bad(`no divisor up to √n = ${fmt(limit)}, so n is prime. A real RSA modulus is never prime.`)));
          return;
        }
        const p = factor;
        const q = n / factor;
        const phi = (p - 1n) * (q - 1n);
        const found = [line(mono(`n = ${fmt(p)} × ${fmt(q)}`), " ", ok("factored"))];
        if (!isPrime(q)) found.push(h("p", { class: "rsa-note", text: `${fmt(q)} is not prime, so n has more than two prime factors and is not a normal RSA modulus.` }));
        else if (e !== null && e > 1n && gcd(e, phi) === 1n) {
          const d = inverseSteps(e, phi).d;
          found.push(
            line(mono(`φ(n) = ${fmt(p - 1n)} × ${fmt(q - 1n)} = ${fmt(phi)}`)),
            line(mono("d = e⁻¹ mod φ = "), mono(fmt(d), "is-key"), " ", ok("private key recovered"))
          );
        }
        // a short or Number-only run says little about BigInt speed, so measure it separately then
        const bigRate = !small && ms > 300 ? rate : calibrate();
        result.append(
          ...found,
          h("span", { class: "rsa-label", text: "The same attack on real key sizes" }),
          h("p", { class: "rsa-note", text: `At about ${fmt(Math.round(bigRate))} divisions per second in this tab:` }),
          estimate(bigRate)
        );
      };

      if (even) {
        tried = 1;
        finish(2n);
        return;
      }

      (function slice() {
        if (me.cancelled) return;
        const until = performance.now() + 30;
        if (small) {
          while (fNum <= limNum) {
            tried++;
            if (nNum % fNum === 0) return finish(BigInt(fNum));
            fNum += 2;
            if ((tried & 4095) === 0 && performance.now() > until) break;
          }
          if (fNum > limNum) return finish(null);
          status.textContent = `Trying divisors… ${fmt(fNum)} of ${fmt(limit)} (${((fNum / limNum) * 100).toFixed(1)}%)`;
        } else {
          while (f <= limit) {
            tried++;
            if (n % f === 0n) return finish(f);
            f += 2n;
            if ((tried & 1023) === 0 && performance.now() > until) break;
          }
          if (f > limit) return finish(null);
          const pctDone = Number((f * 10000n) / limit) / 100;
          status.textContent = `Trying divisors… ${fmt(f)} of ${fmt(limit)} (${pctDone.toFixed(2)}%)`;
        }
        setTimeout(slice, 0);
      })();
    }

    onKey((k) => loadKey(k));
  }

  /* ------------------------------------------------------------------ */

  const MOUNTERS = { keygen: mountKeygen, crypt: mountCrypt, crack: mountCrack };

  function mount(root) {
    const fn = MOUNTERS[root.dataset.rsaFigure];
    if (fn && !root.dataset.mounted) {
      root.dataset.mounted = "true";
      try {
        fn(root);
      } catch (err) {
        root.replaceChildren(h("p", { class: "rsa-placeholder", text: "This figure could not load in your browser." }));
        console.error(err);
      }
    }
  }

  function init() {
    const figures = document.querySelectorAll("[data-rsa-figure]");
    if (typeof BigInt !== "function") {
      figures.forEach((f) => f.replaceChildren(h("p", { class: "rsa-placeholder", text: "These figures need a browser with BigInt support." })));
      return;
    }
    if (!("IntersectionObserver" in window)) {
      figures.forEach(mount);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          io.unobserve(entry.target);
          mount(entry.target);
        });
      },
      { rootMargin: "300px" }
    );
    figures.forEach((f) => io.observe(f));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
