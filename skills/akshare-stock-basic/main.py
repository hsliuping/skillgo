#!/usr/bin/env python3
"""获取 A 股基础信息"""
import json
import os

def main():
    input_path = os.environ.get('SKILL_INPUT', 'input.json')
    output_path = 'output.json'
    try:
        with open(input_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        symbol = str((data.get('input') or {}).get('symbol', '')).strip()
        # 兼容 600519.SH、000001.SZ 等格式，取前 6 位数字
        if '.' in symbol:
            symbol = symbol.split('.')[0]
        if len(symbol) > 6:
            symbol = symbol[:6]
        if not symbol or not symbol.isdigit():
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump({'message': '请提供有效的 symbol 参数（6 位股票代码，如 600519）'}, f, ensure_ascii=False, indent=2)
            return
        try:
            import akshare as ak
            df = ak.stock_individual_info_em(symbol=symbol)
            result = df.set_index('item')['value'].to_dict() if df is not None and not df.empty else {}
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
        except ImportError:
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump({'message': '请安装 akshare: pip install akshare'}, f, ensure_ascii=False, indent=2)
        except Exception as e:
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump({'message': str(e)}, f, ensure_ascii=False, indent=2)
    except Exception as e:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump({'message': str(e)}, f, ensure_ascii=False, indent=2)

if __name__ == '__main__':
    main()
