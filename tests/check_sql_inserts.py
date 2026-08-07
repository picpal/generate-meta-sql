import re, sys

def strip_comments(sql):
    """문자열 리터럴 밖의 -- 주석만 제거. '' escape 처리."""
    out, i, n, instr = [], 0, len(sql), False
    while i < n:
        ch = sql[i]
        if instr:
            out.append(ch)
            if ch == "'":
                if i + 1 < n and sql[i+1] == "'":
                    out.append("'"); i += 2; continue
                instr = False
            i += 1
        else:
            if ch == "'":
                instr = True; out.append(ch); i += 1
            elif sql[i:i+2] == '--':
                j = sql.find('\n', i)
                i = n if j < 0 else j
            else:
                out.append(ch); i += 1
    return ''.join(out)

def split_top(s):
    """깊이 0 콤마로 분리. 문자열 리터럴 내부는 무시."""
    out, depth, cur, instr, i, n = [], 0, "", False, 0, len(s)
    while i < n:
        ch = s[i]
        if instr:
            cur += ch
            if ch == "'":
                if i + 1 < n and s[i+1] == "'":
                    cur += "'"; i += 2; continue
                instr = False
            i += 1; continue
        if ch == "'": instr = True; cur += ch; i += 1; continue
        if ch == '(': depth += 1
        elif ch == ')': depth -= 1
        if ch == ',' and depth == 0:
            out.append(cur); cur = ""
        else:
            cur += ch
        i += 1
    if cur.strip(): out.append(cur)
    return [x.strip() for x in out if x.strip()]

def take_until_top_from(s):
    depth, i, n, instr = 0, 0, len(s), False
    while i < n:
        ch = s[i]
        if instr:
            if ch == "'":
                if i + 1 < n and s[i+1] == "'": i += 2; continue
                instr = False
            i += 1; continue
        if ch == "'": instr = True; i += 1; continue
        if ch == '(': depth += 1
        elif ch == ')':
            if depth == 0: return s[:i]
            depth -= 1
        elif depth == 0 and s[i:i+4].upper() == 'FROM' and \
             (i == 0 or not (s[i-1].isalnum() or s[i-1]=='_')) and \
             (i+4 >= n or not (s[i+4].isalnum() or s[i+4]=='_')):
            return s[:i]
        elif depth == 0 and ch == ';':
            return s[:i]
        i += 1
    return s

total = bad_total = 0
for path in sys.argv[1:]:
    sql = strip_comments(open(path, encoding='utf-8').read())
    pat = re.compile(r'INSERT\s+INTO\s+(\w+)\s*\((.*?)\)\s*(?:SELECT|VALUES\s*\()', re.S | re.I)
    n = bad = 0
    for m in pat.finditer(sql):
        n += 1
        tbl, cols = m.group(1), m.group(2)
        vals = take_until_top_from(sql[m.end():])
        nc, nv = len(split_top(cols)), len(split_top(vals))
        if nc != nv:
            bad += 1
            print(f"  MISMATCH {path} {tbl}: cols={nc} vals={nv}")
            print(f"       vals: {split_top(vals)}")
    total += n; bad_total += bad
    print(f"{path}: INSERT {n}개, 불일치 {bad}개")
print(f"\n합계: INSERT {total}개, 불일치 {bad_total}개")
