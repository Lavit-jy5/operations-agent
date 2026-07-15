# Skills 存放约定

运行时可被模型读取的 skill 放在 `backend/app/skills/` 下，每个技能包一个文件夹：

```text
backend/app/skills/
  hotspot_movement/
    skill.json
    01_writer.md
    02_catalyst_filter.md
    03_data_verification.md
    04_sector_rules.md
    05_compliance_review.md
    original-guide.md
```

建议约定：

- `skill.json`：技能包清单、版本和 skill 名称到文件的映射。
- `*.md`：可被模型注入的拆分后 skill 规则。
- `original-guide.md`：原始指南归档，不直接注入模型。
- 前端 `SkillSettings.jsx`：只展示给用户看的能力开关和说明。
- 后端 `skill_service.py`：决定什么场景加载哪些 skill 内容。

MVP 阶段建议使用内置固定 skill。外部导入 skill 需要额外处理版本、权限、格式校验和失败兜底，适合后续做成高级配置。
