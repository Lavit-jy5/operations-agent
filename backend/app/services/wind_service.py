from datetime import datetime
from uuid import uuid4

from app.models.schemas import WindDataPoint, WindQueryRequest, WindQueryResponse
from app.services.validation_service import validate_wind_data


def query_wind(request: WindQueryRequest) -> WindQueryResponse:
    """占位 Wind 服务。后续在这里替换为真实 WindPy 或企业网关调用。"""
    symbols = request.symbols or ["588000.SH"]
    indicators = request.indicators or ["close", "pct_chg", "amt"]
    today = request.end_date or datetime.now().strftime("%Y-%m-%d")

    data: list[WindDataPoint] = []
    for symbol_index, symbol in enumerate(symbols):
        for indicator_index, indicator in enumerate(indicators):
            value = round(100 + symbol_index * 8.7 + indicator_index * 1.23, 2)
            unit = "%" if "pct" in indicator.lower() else ""
            data.append(
                WindDataPoint(
                    symbol=symbol,
                    indicator=indicator,
                    date=today,
                    value=value,
                    unit=unit,
                )
            )

    return WindQueryResponse(
        request_id=str(uuid4()),
        data=data,
        issues=validate_wind_data(data),
    )
