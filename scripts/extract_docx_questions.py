import json
import re
import shutil
import zipfile
import hashlib
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
OUT_DIR = ROOT / "data" / "parsed"
ASSET_DIR = OUT_DIR / "assets"

NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "m": "http://schemas.openxmlformats.org/officeDocument/2006/math",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


def read_relationships(zf):
    rels = {}
    rel_path = "word/_rels/document.xml.rels"
    if rel_path not in zf.namelist():
      return rels
    root = ET.fromstring(zf.read(rel_path))
    for rel in root:
        rid = rel.attrib.get("Id")
        target = rel.attrib.get("Target")
        rel_type = rel.attrib.get("Type", "")
        if rid and target and "image" in rel_type:
            rels[rid] = "word/" + target.lstrip("/")
    return rels


def node_text(node):
    if node.tag == f"{{{NS['w']}}}t" or node.tag == f"{{{NS['m']}}}t":
        return node.text or ""
    if node.tag == f"{{{NS['w']}}}tab":
        return "\t"
    if node.tag == f"{{{NS['w']}}}br":
        return "\n"
    if node.tag == f"{{{NS['m']}}}f":
        num = node.find("./m:num", NS)
        den = node.find("./m:den", NS)
        return f"{node_text(num)}/{node_text(den)}"
    if node.tag == f"{{{NS['m']}}}sSup":
        base = node.find("./m:e", NS)
        sup = node.find("./m:sup", NS)
        return f"{node_text(base)}^{node_text(sup)}"
    if node.tag == f"{{{NS['m']}}}sSub":
        base = node.find("./m:e", NS)
        sub = node.find("./m:sub", NS)
        return f"{node_text(base)}_{node_text(sub)}"
    if node.tag == f"{{{NS['m']}}}rad":
        deg = node.find("./m:deg", NS)
        expr = node.find("./m:e", NS)
        degree = node_text(deg)
        return f"√{node_text(expr)}" if not degree else f"{degree}√{node_text(expr)}"
    return "".join(node_text(child) for child in list(node))


def paragraph_text(p):
    parts = []
    for child in list(p):
        parts.append(node_text(child))
    return "".join(parts).strip()


def table_text(tbl):
    rows = []
    for tr in tbl.findall(".//w:tr", NS):
        cells = []
        for tc in tr.findall("./w:tc", NS):
            text = "".join(paragraph_text(p) for p in tc.findall(".//w:p", NS)).strip()
            cells.append(text)
        if any(cells):
            rows.append(" | ".join(cells))
    return "\n".join(rows).strip()


def paragraph_assets(p, rels, zf, doc_stem):
    assets = []
    for blip in p.findall(".//a:blip", NS):
        rid = blip.attrib.get(f"{{{NS['r']}}}embed")
        src = rels.get(rid)
        if not src or src not in zf.namelist():
            continue
        suffix = Path(src).suffix or ".png"
        ASSET_DIR.mkdir(parents=True, exist_ok=True)
        digest = hashlib.sha1(f"{doc_stem}/{src}".encode("utf-8")).hexdigest()[:12]
        name = f"asset_{digest}{suffix.lower()}"
        dest = ASSET_DIR / name
        with zf.open(src) as infile, dest.open("wb") as outfile:
            shutil.copyfileobj(infile, outfile)
        assets.append({
            "type": "image",
            "path": str(dest.relative_to(ROOT)).replace("\\", "/"),
            "alt": "题目配图",
        })
    return assets


def docx_blocks(path):
    with zipfile.ZipFile(path) as zf:
        rels = read_relationships(zf)
        root = ET.fromstring(zf.read("word/document.xml"))
        body = root.find("w:body", NS)
        blocks = []
        for child in list(body):
            if child.tag == f"{{{NS['w']}}}p":
                text = paragraph_text(child)
                assets = paragraph_assets(child, rels, zf, path.stem)
                if text or assets:
                    blocks.append({"kind": "p", "text": text, "assets": assets})
            elif child.tag == f"{{{NS['w']}}}tbl":
                text = table_text(child)
                if text:
                    blocks.append({"kind": "table", "text": text, "assets": []})
        return blocks


QUESTION_RE = re.compile(r"^\s*(?:【(?:精讲|精练\d*|例题|真题)[^】]*】|\d{1,3}[).、．]|[一二三四五六七八九十]+[、.．])\s*")
ANSWER_HINT_RE = re.compile(r"(答案|解析|解[:：]|参考答案|详解)")
TITLE_RE = re.compile(r"(专项复习|专项练习|专项训练|基础测评卷|模拟卷|原卷版|解析版|数学试题|期末|月考)$")
SECTION_RE = re.compile(r"^(题型[一二三四五六七八九十\d]+|选择题|填空题|判断题|计算题|解答题|应用题|重点题型|优选真题)")


def classify_type(text, file_name):
    if "几何" in file_name or re.search(r"长方体|正方体|圆|面积|体积|棱长|表面积|图形", text):
        return "几何与图形"
    if "方程" in text or re.search(r"设.*x|未知数|解方程", text, re.I):
        return "方程应用题"
    if re.search(r"分数|通分|约分|百分数", text):
        return "分数运算"
    if re.search(r"应用题|解决问题|行程|工程|平均|价格|买|卖", text):
        return "应用题"
    if "数与代数" in file_name:
        return "数与代数"
    return "五年级数学"


def split_questions(blocks, file_name):
    questions = []
    current = None
    current_assets = []

    def flush():
        nonlocal current, current_assets
        if not current:
            return
        text = "\n".join(part for part in current if part).strip()
        compact = re.sub(r"\s+", "", text)
        if (
            len(text) < 8
            or ANSWER_HINT_RE.search(text[:30])
            or TITLE_RE.search(compact)
            or SECTION_RE.search(compact)
            or "共" in compact and "题" in compact and len(compact) < 80
            or compact.count("题型") >= 3
            or compact.count("\t") >= 3
            or compact in {"选择题", "填空题", "判断题", "计算题", "解答题", "应用题"}
        ):
            current = None
            current_assets = []
            return
        answer = ""
        explanation = ""
        m = re.search(r"(?:答案|参考答案)[:：]?\s*(.+)", text)
        if m:
            answer = m.group(1).strip()
        if "解析" in text or "解：" in text or "解:" in text:
            explanation = text
        questions.append({
            "text": text,
            "type": classify_type(text, file_name),
            "answer": answer,
            "explanation": explanation,
            "assets": current_assets,
        })
        current = None
        current_assets = []

    for block in blocks:
        text = block["text"].strip()
        compact = re.sub(r"\s+", "", text)
        if SECTION_RE.search(compact):
            flush()
            continue
        is_question_start = bool(QUESTION_RE.match(text)) and not ANSWER_HINT_RE.search(text[:20])
        if is_question_start:
            flush()
            current = [QUESTION_RE.sub("", text).strip()]
            current_assets = list(block["assets"])
        elif current:
            current.append(text)
            current_assets.extend(block["assets"])
        elif block["assets"]:
            current = [text]
            current_assets = list(block["assets"])

    flush()
    return questions


def fill_missing_answer(question):
    if question.get("answer"):
        return question
    q = dict(question)
    text = q.get("text", "")
    answer_from_text = extract_answer_from_text(text)
    if answer_from_text:
        q["answer"] = answer_from_text
        q["explanation"] = q.get("explanation") or text
        return q
    if q.get("explanation"):
        q["answer"] = "参考解析见 explanation 字段"
        return q
    if q.get("assets"):
        q["answer"] = "待人工校验：本题含图形/图片，原文未提供可自动提取的标准答案。"
        q["explanation"] = q.get("explanation") or "题目包含图形资源，建议家长或老师核对图形条件后补充标准解析。"
        return q
    if re.search(r"解方程|x|χ", text, re.I):
        q["answer"] = "待人工校验：方程题原文未提供可自动提取的标准答案。"
        q["explanation"] = q.get("explanation") or "建议按移项、合并同类项或等式性质求解，并核对代入结果。"
        return q
    if re.search(r"判断|对吗|说明理由", text):
        q["answer"] = "待人工校验：判断/说明理由题原文未提供可自动提取的标准答案。"
        q["explanation"] = q.get("explanation") or "建议先计算题中数量关系，再用一句话说明判断依据。"
        return q
    q["answer"] = "待人工校验：原文未提供可自动提取的标准答案。"
    q["explanation"] = q.get("explanation") or "建议根据题目条件列式计算，确认单位和最终问题一致。"
    return q


def extract_answer_from_text(text):
    for pattern in [
        r"答[:：]\s*([^\n。；;]+)",
        r"所以[:：]?\s*([^\n。；;]+)",
        r"即[:：]?\s*([^\n。；;]+)",
    ]:
        m = re.search(pattern, text)
        if m:
            return m.group(1).strip()
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return ""
    last = lines[-1]
    if len(last) <= 80 and re.search(r"[=≈]|（.*?）|元|米|厘米|平方|立方|升|毫升|千克|克|人|本|页|小时|分钟|＜|＞", last):
        return last
    return ""


def write_sql_select(path, questions):
    values = []
    for q in questions:
        payload = json.dumps(q, ensure_ascii=False)
        values.append("'" + payload.replace("'", "''") + "'::jsonb")
    sql = (
        "-- Parsed question bank rows for Supabase.\n"
        "-- Each row is a JSONB object with {text,type,answer,explanation,assets,source}.\n\n"
        "WITH rows(data) AS (\n  VALUES\n  "
        + ",\n  ".join(f"({v})" for v in values)
        + "\n)\n"
        "SELECT data FROM rows;\n"
    )
    path.write_text(sql, encoding="utf-8")


def write_question_bank_insert(path, title, questions):
    payload = json.dumps([
        {
            "text": q["text"],
            "type": q["type"],
            "answer": q["answer"],
            "explanation": q["explanation"],
            "assets": q["assets"],
        }
        for q in questions
    ], ensure_ascii=False)
    safe_title = title.replace("'", "''")
    safe_payload = payload.replace("'", "''")
    sql = (
        "-- Insert parsed questions into the existing question_banks table.\n"
        "-- Change user_id/title if needed before running in Supabase SQL Editor.\n\n"
        "INSERT INTO question_banks (user_id, title, questions)\n"
        "VALUES (\n"
        "  'math-buddy-user',\n"
        f"  '{safe_title}',\n"
        f"  '{safe_payload}'::jsonb\n"
        ");\n"
    )
    path.write_text(sql, encoding="utf-8")


def source_metadata(source):
    chapter = ""
    if "分数加减法" in source:
        chapter = "分数加减法"
    elif "长方体和正方体" in source or "几何" in source:
        chapter = "长方体和正方体/几何与图形"
    elif "分数乘除法" in source:
        chapter = "分数乘除法"
    elif "方程" in source or "应用题" in source:
        chapter = "方程与应用题"
    elif "数与代数" in source:
        chapter = "数与代数"
    elif "期末" in source or "月考" in source or "周测" in source:
        chapter = "综合测试"
    return {
        "source": source,
        "grade": "五年级下册",
        "subject": "数学",
        "curriculum": "北师大版" if "北师大" in source else "",
        "chapter": chapter,
    }


def best_practice_question(q, index):
    meta = source_metadata(q["source"])
    answer_status = "verified_from_source"
    if "待人工校验" in str(q.get("answer", "")):
        answer_status = "needs_review"
    elif q.get("answer") == "参考解析见 explanation 字段":
        answer_status = "explanation_only"
    return {
        "external_id": f"docx-{index:04d}",
        "text": q["text"],
        "type": q["type"],
        "answer": q["answer"],
        "explanation": q["explanation"],
        "assets": q["assets"],
        "answer_status": answer_status,
        "difficulty": "",
        "tags": [tag for tag in [q["type"], meta["chapter"]] if tag],
        **meta,
    }


def write_normalized_schema(path):
    sql = """-- Recommended normalized schema for imported question banks.
-- Run in Supabase SQL Editor before insert-normalized-questions.sql.

CREATE TABLE IF NOT EXISTS question_bank_sources (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'math-buddy-user',
  title TEXT NOT NULL,
  source TEXT,
  grade TEXT,
  subject TEXT DEFAULT '数学',
  curriculum TEXT,
  chapter TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS questions (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'math-buddy-user',
  bank_source_id BIGINT REFERENCES question_bank_sources(id) ON DELETE SET NULL,
  external_id TEXT,
  text TEXT NOT NULL,
  type TEXT NOT NULL,
  answer TEXT NOT NULL,
  explanation TEXT NOT NULL DEFAULT '',
  assets JSONB NOT NULL DEFAULT '[]',
  answer_status TEXT NOT NULL DEFAULT 'needs_review',
  difficulty TEXT,
  grade TEXT,
  subject TEXT DEFAULT '数学',
  curriculum TEXT,
  chapter TEXT,
  tags JSONB NOT NULL DEFAULT '[]',
  source TEXT,
  raw JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_questions_user_created ON questions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_questions_chapter ON questions(chapter);
CREATE INDEX IF NOT EXISTS idx_questions_answer_status ON questions(answer_status);
CREATE INDEX IF NOT EXISTS idx_questions_source ON questions(source);

ALTER TABLE question_bank_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "question_bank_sources_access" ON question_bank_sources;
DROP POLICY IF EXISTS "questions_access" ON questions;
CREATE POLICY "question_bank_sources_access" ON question_bank_sources FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "questions_access" ON questions FOR ALL USING (true) WITH CHECK (true);
"""
    path.write_text(sql, encoding="utf-8")


def write_normalized_insert(path, questions):
    rows = []
    for q in questions:
        payload = json.dumps(q, ensure_ascii=False).replace("'", "''")
        rows.append(f"('{payload}'::jsonb)")
    sql = (
        "-- Insert normalized imported questions.\n"
        "-- Requires import-normalized-schema.sql first.\n\n"
        "WITH rows(data) AS (\n  VALUES\n  "
        + ",\n  ".join(rows)
        + "\n), source_rows AS (\n"
        "  INSERT INTO question_bank_sources (user_id, title, source, grade, subject, curriculum, chapter)\n"
        "  SELECT DISTINCT\n"
        "    'math-buddy-user',\n"
        "    COALESCE(data->>'chapter', '导入题库'),\n"
        "    data->>'source',\n"
        "    data->>'grade',\n"
        "    data->>'subject',\n"
        "    data->>'curriculum',\n"
        "    data->>'chapter'\n"
        "  FROM rows\n"
        "  RETURNING id, source\n"
        ")\n"
        "INSERT INTO questions (\n"
        "  user_id, bank_source_id, external_id, text, type, answer, explanation, assets,\n"
        "  answer_status, difficulty, grade, subject, curriculum, chapter, tags, source, raw\n"
        ")\n"
        "SELECT\n"
        "  'math-buddy-user',\n"
        "  source_rows.id,\n"
        "  data->>'external_id',\n"
        "  data->>'text',\n"
        "  data->>'type',\n"
        "  data->>'answer',\n"
        "  COALESCE(data->>'explanation', ''),\n"
        "  COALESCE(data->'assets', '[]'::jsonb),\n"
        "  data->>'answer_status',\n"
        "  data->>'difficulty',\n"
        "  data->>'grade',\n"
        "  data->>'subject',\n"
        "  data->>'curriculum',\n"
        "  data->>'chapter',\n"
        "  COALESCE(data->'tags', '[]'::jsonb),\n"
        "  data->>'source',\n"
        "  data\n"
        "FROM rows\n"
        "LEFT JOIN source_rows ON source_rows.source = rows.data->>'source';\n"
    )
    path.write_text(sql, encoding="utf-8")


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    all_questions = []
    by_file = {}
    for path in sorted(DATA_DIR.glob("*.docx")):
        blocks = docx_blocks(path)
        questions = split_questions(blocks, path.name)
        by_file[path.name] = questions
        all_questions.extend({**q, "source": path.name} for q in questions)

    (OUT_DIR / "questions-by-file.json").write_text(
        json.dumps(by_file, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (OUT_DIR / "questions-supabase.json").write_text(
        json.dumps(all_questions, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    filled_questions = [fill_missing_answer(q) for q in all_questions]
    ready_questions = [
        {
            "text": q["text"],
            "type": q["type"],
            "answer": q["answer"],
            "explanation": q["explanation"],
            "assets": q["assets"],
        }
        for q in filled_questions
    ]
    best_questions = [best_practice_question(q, i + 1) for i, q in enumerate(filled_questions)]
    (OUT_DIR / "questions-supabase-filled.json").write_text(
        json.dumps(filled_questions, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (OUT_DIR / "questions-supabase-ready.json").write_text(
        json.dumps(ready_questions, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (OUT_DIR / "questions-supabase-best-practice.json").write_text(
        json.dumps(best_questions, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    write_sql_select(OUT_DIR / "questions-supabase-select.sql", all_questions)
    write_sql_select(OUT_DIR / "questions-supabase-filled-select.sql", filled_questions)
    write_question_bank_insert(
        OUT_DIR / "insert-question-bank-filled.sql",
        "五年级下册数学导入题库",
        filled_questions,
    )
    write_normalized_schema(OUT_DIR / "import-normalized-schema.sql")
    write_normalized_insert(OUT_DIR / "insert-normalized-questions.sql", best_questions)
    print(json.dumps({
        "files": len(by_file),
        "questions": len(all_questions),
        "missing_answer": sum(1 for q in all_questions if not q.get("answer")),
        "filled_missing_answer": sum(1 for q in filled_questions if not q.get("answer")),
        "output": str((OUT_DIR / "questions-supabase.json").relative_to(ROOT)),
        "filled_output": str((OUT_DIR / "questions-supabase-filled.json").relative_to(ROOT)),
        "ready_output": str((OUT_DIR / "questions-supabase-ready.json").relative_to(ROOT)),
        "best_practice_output": str((OUT_DIR / "questions-supabase-best-practice.json").relative_to(ROOT)),
        "sql_preview": str((OUT_DIR / "questions-supabase-select.sql").relative_to(ROOT)),
        "filled_sql_preview": str((OUT_DIR / "questions-supabase-filled-select.sql").relative_to(ROOT)),
        "insert_sql": str((OUT_DIR / "insert-question-bank-filled.sql").relative_to(ROOT)),
        "normalized_schema_sql": str((OUT_DIR / "import-normalized-schema.sql").relative_to(ROOT)),
        "normalized_insert_sql": str((OUT_DIR / "insert-normalized-questions.sql").relative_to(ROOT)),
        "assets_dir": str(ASSET_DIR.relative_to(ROOT)),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
