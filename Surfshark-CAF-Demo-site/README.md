# Surfshark Cybersecurity Advocacy Fund Application Demo

A web demo of text that carries proof it was typed by hand.

## How the demo verifies

Everything runs in the visitor's browser. Nothing is sent anywhere.

Three things verify, and nothing else does:

1. Every sentence on this site.
2. The pitch (`pitch.txt`), which carries a certificate signed with the demo key (`pitch-certificate.json`).
3. Text a visitor types by hand into the Demo box while demo signing is switched on.

Text pasted in from anywhere else is marked as not typed by hand. Changing a single word in verified
text fails only the words around it.

The desktop tool that records typing from a laptop's built-in keyboard is a separate prototype. This
site demonstrates the verification side of it.

## Files

| File | What it is |
|---|---|
| `index.html`, `verify.js` | The page, and the code that checks and signs in the browser |
| `pitch.txt` | The pitch |
| `pitch-certificate.json` | The pitch's certificate, signed with the demo key (ECDSA P-256, SHA-256) |

## Checking the pitch certificate yourself

The signed bytes are the certificate without its `sig` field, encoded with sorted keys and no spaces.

```bash
python3 - <<'PY'
import json, base64
c = json.load(open("pitch-certificate.json"))
def canon(v):
    if isinstance(v, dict): return "{" + ",".join('"%s":%s' % (k, canon(v[k])) for k in sorted(v)) + "}"
    if isinstance(v, list): return "[" + ",".join(canon(x) for x in v) + "]"
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, int):  return str(v)
    return '"' + v.replace("\\", "\\\\").replace('"', '\\"') + '"'
open("body.txt", "w").write(canon({k: v for k, v in c.items() if k != "sig"}))
open("sig.der", "wb").write(base64.b64decode(c["sig"]))
open("pub.der", "wb").write(base64.b64decode(c["pubKey"]))
PY
openssl ec -pubin -inform DER -in pub.der -out pub.pem
openssl dgst -sha256 -verify pub.pem -signature sig.der body.txt
```
