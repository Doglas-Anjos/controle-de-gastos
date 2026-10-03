from gastos.domain.normalize import normalizar


def test_mesmo_comerciante_vira_mesma_chave():
    chaves = {
        normalizar("NETFLIX.COM 03/12").description_norm,
        normalizar("Netflix.com").description_norm,
        normalizar("NETFLIX.COM SAO PAULO BR").description_norm,
        normalizar("NETFLIX*COM 12/03 14:22").description_norm,
    }
    assert chaves == {"netflix com"}


def test_parcela_e_extraida_e_removida():
    r = normalizar("MAGAZINE EXEMPLO PARC 03/12")
    assert (r.installment_n, r.installment_total) == (3, 12)
    assert r.description_norm == "magazine exemplo"
    r2 = normalizar("Loja Beta parcela 2 de 6")
    assert (r2.installment_n, r2.installment_total) == (2, 6)


def test_prefixo_de_pagamento_sai_mas_destino_fica():
    assert normalizar("PIX ENVIADO ACADEMIA FORMA").description_norm == "academia forma"
    assert normalizar("Compra no debito MERCADO EXEMPLO 1234").description_norm == "mercado exemplo"


def test_descricao_so_com_ruido_cai_no_original():
    assert normalizar("12345").description_norm == "12345"
    assert normalizar("").description_norm == ""
