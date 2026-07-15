from app.models.schemas import ValidationIssue, WindDataPoint


def validate_wind_data(data: list[WindDataPoint]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []

    if not data:
        return [
            ValidationIssue(
                level="error",
                field="data",
                message="没有返回任何数据，请检查代码、指标或日期区间。",
            )
        ]

    for item in data:
        if item.value is None or item.value == "":
            issues.append(
                ValidationIssue(
                    level="warning",
                    field=f"{item.symbol}.{item.indicator}",
                    message="该字段为空，生成快报前需要人工确认。",
                )
            )
        if item.unit == "":
            issues.append(
                ValidationIssue(
                    level="info",
                    field=f"{item.symbol}.{item.indicator}",
                    message="当前字段缺少单位，建议在正式接入 Wind 时补齐单位映射。",
                )
            )

    return issues

