"""
ETL do dashboard PEE.

Busca os dados publicados da planilha "PEE - Brasil" (Google Sheets > Publicar na web,
uma aba por vez em CSV), limpa e consolida tudo em dois arquivos JSON estáticos
consumidos pelo dashboard (public/data/*.json):

  - resultados.json : projetos já submetidos/julgados em cada distribuidora
  - editais.json    : chamadas públicas (CPPs) abertas/encerradas, por estado

Não depende de bibliotecas externas (só stdlib) para rodar sem fricção no
GitHub Actions.
"""

from __future__ import annotations

import csv
import gzip
import io
import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SPREADSHEET_KEY = "2PACX-1vT1cqXEyScLjOZmNGCmY03J3qTAJ2yFcS6pESAJaIBv9gjDA98r0hrSA46Vp-3wiVwHEXKpvUgJLJcp"

# nome da aba -> gid (obtido publicando cada aba individualmente em Arquivo > Compartilhar > Publicar na web)
SHEET_GIDS = {
    "editais": "1050696181",       # PEE - CPPs_aberto
    "Enel SP": "870349377",        # Enel SP Resultados
    "EDP SP": "1338720228",        # EDP SP Resultados
    "CPFL": "512894432",           # CPFL Resultados (já tem coluna Distribuidora)
    "Neoenergia": "165421969",     # idem
    "Equatorial": "1502505136",    # idem
    "Cemig": "1361405797",         # Cemig Resultados (ainda sem dados)
}

# distribuidoras que NÃO têm coluna "Distribuidora" própria na aba de resultados
SHEET_DEFAULT_DISTRIBUIDORA = {
    "Enel SP": "Enel SP",
    "EDP SP": "EDP SP",
}

# Distribuidora -> UF, para plotar no mapa
DISTRIBUIDORA_UF = {
    "Enel SP": "SP",
    "EDP SP": "SP",
    "CPFL Paulista": "SP",
    "CPFL Piratininga": "SP",
    "Neoenergia Elektro": "SP",
    "Equatorial AL": "AL",
    "Equatorial AP": "AP",
    "Equatorial GO": "GO",
    "Equatorial MA": "MA",
    "Equatorial PA": "PA",
    "Equatorial PI": "PI",
    "Equatorial RS": "RS",
    "Cemig": "MG",
}

ESTADO_UF = {
    "Acre": "AC", "Alagoas": "AL", "Amapá": "AP", "Amazonas": "AM", "Bahia": "BA",
    "Ceará": "CE", "Distrito Federal": "DF", "Espírito Santo": "ES", "Goiás": "GO",
    "Maranhão": "MA", "Mato Grosso": "MT", "Mato Grosso do Sul": "MS",
    "Minas Gerais": "MG", "Pará": "PA", "Paraíba": "PB", "Paraná": "PR",
    "Pernambuco": "PE", "Piauí": "PI", "Rio de Janeiro": "RJ",
    "Rio Grande do Norte": "RN", "Rio Grande do Sul": "RS", "Rondônia": "RO",
    "Roraima": "RR", "Santa Catarina": "SC", "São Paulo": "SP", "Sergipe": "SE",
    "Tocantins": "TO",
}

BR_STATES_GEOJSON_URL = (
    "https://raw.githubusercontent.com/codeforamerica/click_that_hood"
    "/master/public/data/brazil-states.geojson"
)

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "data"


def fetch_states_geojson() -> dict:
    """Malha dos estados do Brasil (já vem com properties.sigla pronta)."""
    req = urllib.request.Request(BR_STATES_GEOJSON_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()
        if raw[:2] == b"\x1f\x8b":
            raw = gzip.decompress(raw)
        geo = json.loads(raw.decode("utf-8"))
    return geo


def clean_text(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", value).strip()


def _csv_url(gid: str) -> str:
    return (
        f"https://docs.google.com/spreadsheets/d/e/{SPREADSHEET_KEY}"
        f"/pub?gid={gid}&single=true&output=csv"
    )


def fetch_sheet(gid: str) -> list[dict]:
    req = urllib.request.Request(_csv_url(gid), headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        text = resp.read().decode("utf-8")
    return list(csv.DictReader(io.StringIO(text)))


def parse_brl(value: str | None) -> float | None:
    """'R$ 1.234.567,89' -> 1234567.89"""
    if not value or not value.strip():
        return None
    cleaned = re.sub(r"[^\d,.-]", "", value)
    cleaned = cleaned.replace(".", "").replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_comma_float(value: str | None) -> float | None:
    """'0,56' / '78,5' -> 0.56 / 78.5"""
    if not value or not value.strip():
        return None
    try:
        return float(value.strip().replace(",", "."))
    except ValueError:
        return None


def parse_int(value: str | None) -> int | None:
    if not value or not value.strip():
        return None
    try:
        return int(float(value.strip().replace(",", ".")))
    except ValueError:
        return None


def parse_br_date(value: str | None) -> str | None:
    """'15/06/2026' -> '2026-06-15' (ISO, mais fácil de ordenar/filtrar no JS)"""
    if not value or not value.strip():
        return None
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", value.strip())
    if not m:
        return None
    d, mth, y = m.groups()
    return f"{y}-{int(mth):02d}-{int(d):02d}"


def load_resultados() -> list[dict]:
    registros: list[dict] = []
    for nome_aba, gid in SHEET_GIDS.items():
        if nome_aba == "editais":
            continue
        linhas = fetch_sheet(gid)
        for linha in linhas:
            titulo = clean_text(linha.get("Título Projeto"))
            if not titulo:
                continue
            distribuidora = (
                clean_text(linha.get("Distribuidora"))
                or SHEET_DEFAULT_DISTRIBUIDORA.get(nome_aba, nome_aba)
            )
            registros.append({
                "distribuidora": distribuidora,
                "uf": DISTRIBUIDORA_UF.get(distribuidora),
                "titulo_projeto": titulo,
                "tipologia": clean_text(linha.get("Tipologia")),
                "usos_finais": clean_text(linha.get("Usos Finais")),
                "empresa_proponente": clean_text(linha.get("Empresa Proponente")),
                "cliente": clean_text(linha.get("Nome do cliente beneficiado")),
                "rcb_pee": parse_comma_float(linha.get("RCB PEE")),
                "valor_total_projeto": parse_brl(linha.get("Valor total do Projeto")),
                "valor_solicitado_pee": parse_brl(linha.get("Valor Solicitado ao PEE")),
                "contrapartida": parse_brl(linha.get("Contrapartida")),
                "pontuacao_alcancada": parse_comma_float(linha.get("Pontuação Alcançada")),
                "resultado": clean_text(linha.get("Resultado")),
                "ano": parse_int(linha.get("Ano")),
            })
    return registros


def load_editais() -> list[dict]:
    linhas = fetch_sheet(SHEET_GIDS["editais"])
    editais: list[dict] = []
    for linha in linhas:
        distribuidora = clean_text(linha.get("Distribuidora"))
        if not distribuidora:
            continue
        estado = clean_text(linha.get("Estado"))
        editais.append({
            "distribuidora": distribuidora,
            "estado": estado,
            "uf": ESTADO_UF.get(estado, DISTRIBUIDORA_UF.get(distribuidora)),
            "tipologia": clean_text(linha.get("Tipologia")),
            "recurso_total_tipologia": parse_brl(linha.get("Recurso Total Por Tipologia")),
            "recurso_minimo_projeto": parse_brl(linha.get("Recurso Mínimo Por Projeto")),
            "recurso_maximo_projeto": parse_brl(linha.get("Recurso Máximo Por Projeto")),
            "ano_chamada": parse_int(linha.get("Ano Chamada")),
            "data_abertura": parse_br_date(linha.get("Data de Abertura")),
            "data_entrega": parse_br_date(linha.get("Data de Entrega")),
            "divulgacao_final": parse_br_date(linha.get("Divulgação Final")),
            "link_edital": clean_text(linha.get("Link Edital")),
            "status": clean_text(linha.get("Status")),
        })
    return editais


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    resultados = load_resultados()
    editais = load_editais()

    (OUT_DIR / "resultados.json").write_text(
        json.dumps(resultados, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (OUT_DIR / "editais.json").write_text(
        json.dumps(editais, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    geojson_path = OUT_DIR / "br_states.geojson"
    if not geojson_path.exists():
        geojson_path.write_text(
            json.dumps(fetch_states_geojson(), ensure_ascii=False), encoding="utf-8"
        )

    meta = {"gerado_em": datetime.now(timezone.utc).isoformat()}
    (OUT_DIR / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"resultados: {len(resultados)} registros")
    print(f"editais: {len(editais)} registros")


if __name__ == "__main__":
    main()
