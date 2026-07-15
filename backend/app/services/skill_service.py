import json
from functools import lru_cache
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1] / "skills"


@lru_cache(maxsize=16)
def load_skill_manifest(slug: str) -> dict:
    manifest_path = SKILL_ROOT / slug / "skill.json"
    if not manifest_path.exists():
        return {}
    return json.loads(manifest_path.read_text(encoding="utf-8"))


@lru_cache(maxsize=64)
def load_skill_file(slug: str, filename: str) -> str:
    skill_path = SKILL_ROOT / slug / filename
    if not skill_path.exists():
        return ""
    return skill_path.read_text(encoding="utf-8")


def load_skill_package(slug: str, enabled_names: list[str]) -> str:
    manifest = load_skill_manifest(slug)
    if not manifest:
        return ""

    selected_names = set(enabled_names or manifest.get("default_enabled", []))
    sections: list[str] = []

    for skill in manifest.get("skills", []):
        name = skill.get("name", "")
        filename = skill.get("file", "")
        if name not in selected_names or not filename:
            continue

        content = load_skill_file(slug, filename)
        if content:
            sections.append(f"【{name}】\n{content}")

    if not sections:
        return ""

    title = manifest.get("name", slug)
    version = manifest.get("version", "")
    return f"【{title} v{version}】\n" + "\n\n".join(sections)


def load_relevant_skill_context(brief_type: str, required_skills: list[str]) -> str:
    contexts: list[str] = []

    if brief_type == "热点异动":
        hotspot_context = load_skill_package("hotspot_movement", required_skills)
        if hotspot_context:
            contexts.append(hotspot_context)
    elif brief_type == "热点文章":
        article_context = load_skill_package("hotspot_article", required_skills)
        if article_context:
            contexts.append(article_context)

    return "\n\n".join(contexts)
