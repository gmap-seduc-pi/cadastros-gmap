#!/usr/bin/env bash
# Recria os dados de exemplo da demonstração a partir do banco de teste local e gera o HTML.
# Uso: PGHOST=/tmp/pg PGPORT=5499 PGUSER=postgres ./demo/atualizar_dados.sh
set -euo pipefail
cd "$(dirname "$0")/.."
./supabase/testes/rodar_testes.sh > /dev/null
psql -q -d cadastros_teste -v ON_ERROR_STOP=1 -f demo/semente_demo.sql > /dev/null 2> >(grep -v NOTICE >&2)
saida=demo/dados_exemplo.json; echo "{" > $saida; primeiro=1
for t in perfis configuracao auditoria gres municipios tipologias territorios zonas tipos_ambiente funcoes_responsavel classes_material \
         entidades dados_escola matriculas_anuais ambientes materiais fornecedores contratos contrato_aditivos servidores entidade_responsaveis contrato_fiscais; do
  [ $primeiro = 1 ] || echo "," >> $saida; primeiro=0
  echo "\"$t\": $(psql -At -d cadastros_teste -c "select coalesce(json_agg(x order by 1),'[]') from public.$t x")" >> $saida
done
echo "}" >> $saida
python3 demo/gerar_demo.py
