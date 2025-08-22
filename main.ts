import * as getargs from "github.com/scorredoira/getargs"

export function main(...args: string[]) {
    const parser = new getargs.Parser(args)
    parser.addFlag("s", ".", "source")
    parser.addFlag("o", "out.js", "destination file")
    parser.addOption("m", "minify")
    parser.addOption("w", "watch changes and build automatically")
    parser.addOption("v", "verbose")

    const src = parser.flag("s")
    const out = parser.flag("o")
    const minify = parser.option("m")
    const watch = parser.option("w")
    const verbose = parser.option("v")

    build(src, out, minify, verbose)

    if (watch) {
        watchChanges(src, out, minify, verbose)
    }
}

function build(src: string, out: string, minify: boolean, verbose: boolean) {
    buildJS(src, out, minify, verbose)
    buildCSS(src, out, minify, verbose)
}

function watchChanges(src: string, out: string, minify: boolean, verbose: boolean) {
    let w = fsnotify.newWatcher(e => {
        switch (e.operation) {
            case 1: // create
            case 2: // edit
            case 8: // delete
                break
            default:
                return
        }

        let file = e.name

        if (file.endsWith(".ts") && !file.endsWith(".d.ts")) {
            throttle("ts", () => {
                buildJS(src, out, minify, verbose)
                http.resetCacheBreaker()
            })
            return
        }

        if (file.endsWith(".css")) {
            throttle("css", () => {
                buildCSS(src, out, minify, verbose)
                http.resetCacheBreaker()
            })
            return
        }
    })

    w.add(src)

    // lock forever
    const mut = sync.newMutex()
    mut.lock()
    mut.lock()
}

let mut = sync.newMutex()
let calls = {} as Map<time.Timer>
const RELOAD_DELAY = 100

export function throttle(key: string, fn: Function) {
    mut.lock()
    defer(mut.unlock)

    let t = calls[key]
    if (t) {
        t.stop()
    }

    calls[key] = time.newTimer(RELOAD_DELAY * time.Millisecond, () => {
        fn()
    })
}

function buildJS(src: string, out: string, minify: boolean, verbose: boolean) {
    const combined = getCombinedTS(src)

    let bundle = filepath.join("/tmp", uuid.newRandomID() + ".ts")
    os.write(bundle, combined)

    defer(() => os.removeAll(bundle))

    if (!out.endsWith(".js")) {
        out += ".js"
    }

    const banner = `"use strict";`

    let args = [
        bundle,
        "--target=esnext",
        "--outfile=" + out,
        "--banner:js=" + banner
    ]

    if (!verbose) {
        args.push("--log-level=silent")
    }

    if (minify) {
        args.push("--minify")
    } else {
        args.push("--sourcemap")
        args.push("--sourcemap=inline")
    }

    try {
        os.exec("esbuild", ...args)
    } catch (error) {
        console.log("error generating JS for %s: %s", src, error.message)
    }
}

function buildCSS(src: string, out: string, minify: boolean, verbose: boolean) {
    const combined = getCombinedCSS(src)

    if (!out.endsWith(".css")) {
        out += ".css"
    }

    os.write(out, combined)

    if (minify) {
        let args = [
            out,
            "--minify",
            "--allow-overwrite",
            "--outfile=" + out,
        ]

        if (!verbose) {
            args.push("--log-level=silent")
        }

        try {
            os.exec("esbuild", ...args)
        } catch (error) {
            console.log("error generating CSS for %s: %s", src, error.message)
        }
    }
}

function getCombinedTS(src: string) {
    let files: string[]

    if (os.stat(src).isDir) {
        files = os.readNames(src, true).where(t => t.endsWith(".ts") && !t.endsWith(".d.ts"))
        files.sort((a, b) => a.toLowerCase() < b.toLowerCase())
    } else {
        files = [src]
    }

    return files.select(t => os.readString(t)).where(t => t.trim() != "").join("\n\n")
}

function getCombinedCSS(src: string) {
    let files: string[]

    if (os.stat(src).isDir) {
        files = os.readNames(src, true).where(t => t.endsWith(".css"))
        files.sort((a, b) => a.toLowerCase() < b.toLowerCase())
    } else {
        files = [src]
    }

    return files.select(t => os.readString(t)).where(t => t.trim() != "").join("\n\n")
}




function processCss(code: string) {
    code = processCssScopes(code)
    return code
}


function processCssScopes(code: string) {
    let srcParts = []

    const PATTERN = "/\*\s*SCOPE\s+([^\s]+)\s*\*/"
    const CLOSE = "/\*\s+END\s+\*/"

    for (let i = 0, l = code.length; i < l; i++) {
        let m = regex.findAllStringSubmatchIndex(PATTERN, code.substring(i), 1)

        if (m.length == 0) {
            srcParts.push(code.substring(i))
            break
        }

        let openStart = m[0][0]
        if (openStart > i) {
            srcParts.push(code.substring(i, openStart))
        }

        let z = regex.findAllStringSubmatch(PATTERN, code.substring(i + openStart), 1)
        let openLength = z[0][0].length
        let prefix = z[0][1]

        let innerStart = i + openStart + openLength

        let e = regex.findAllStringSubmatchIndex(CLOSE, code.substring(innerStart))
        if (e.length == 0) {
            throw "unclosed block"
        }

        let blockCode = code.substring(innerStart, innerStart + e[0][0])

        srcParts.push(applyPrefix(blockCode, "." + prefix))

        i = innerStart + e[0][1]
    }

    return srcParts.join("\n")
}


function applyPrefix(code: string, prefixCode: string) {
    let buf = []
    let rules = parseRule(code, prefixCode)

    for (let r of rules) {
        buf.push(r.selectors.select(t => prefixSelector(prefixCode, t)).join(",\n"))
        buf.push(" ")
        buf.push(r.body)
        buf.push("\n\n")
    }

    return buf.join()
}

function prefixSelector(prefix: string, sel: string) {
    // don't prefix comments
    if (sel.startsWith("/*")) {
        return sel
    }

    // don't prefix media rules 
    if (sel.startsWith("@")) {
        return sel
    }

    // don't prefix root rules
    if (sel == "root") {
        return prefix
    }

    if (sel.startsWith("root.") || sel.startsWith("root:")) {
        return prefix + sel.trimPrefix("root")
    }

    if (sel.startsWith("root ")) {
        return prefix + sel.trimPrefix("root")
    }

    // common to the directory styles.
    if (sel.startsWith("directory")) {
        let parts = prefix.splitClean("-")
        parts.removeAt(parts.length - 1)
        prefix = parts.join("-")
        return prefix + sel.trimPrefix("directory")
    }

    return prefix + " " + sel
}

interface Rule {
    selectors: string[]
    body: string
}

function parseRule(code: string, prefixCode?: string) {
    let rules: Rule[] = []
    let buf = []
    let isBody
    let mediaRuleStart = -1
    let nestedBrackets = 0
    let selectors = []

    OUTER:
    for (let i = 0, j = code.runeCount; i < j; i++) {
        let c = code.runeAt(i)

        // Skip comments
        if (c == "/" && i + 3 < j) {
            if (code.runeAt(i + 1) == "*") {
                for (let k = i + 2; k < j; k++) {
                    if (code.runeAt(k) == "/" && code.runeAt(k - 1) == "*") {
                        i = k
                        continue OUTER
                    }
                }
            }
        }

        switch (c) {
            case ",":
                if (!isBody) {
                    selectors.push(buf.join().trim("\n \t"))
                    buf = []
                } else {
                    buf.push(c)
                }
                break

            case "{":
                if (isBody) {
                    buf.push(c)
                    nestedBrackets++
                    continue
                }

                let selector = buf.join().trim("\n \t")
                selectors.push(selector)
                buf = []
                buf.push(c)
                isBody = true

                // las reglas de media tienen que tener prefijo tambien en su contenido
                if (selector.startsWith("@media")) {
                    mediaRuleStart = buf.length
                }
                break

            case "}":
                if (nestedBrackets) {
                    buf.push(c)
                    nestedBrackets--
                    continue
                }

                if (mediaRuleStart >= 0) {
                    let mediaRules = buf.slice(mediaRuleStart).join()
                    mediaRules = applyPrefix(mediaRules, prefixCode)

                    // esto es para dejarlo lo más parecido posible al original
                    mediaRules = mediaRules.trimSuffix("\n")

                    buf = buf.slice(0, mediaRuleStart)

                    // esto es para dejarlo lo más parecido posible al original.
                    // mi vscode mete 4 espacios
                    buf.push("\n    ")

                    buf.push(mediaRules)
                    mediaRuleStart = -1
                }

                buf.push(c)
                rules.push({
                    selectors: selectors,
                    body: buf.join(),
                })
                isBody = false
                buf = []
                selectors = []
                break

            default:
                buf.push(c)
                break
        }
    }

    return rules
}
