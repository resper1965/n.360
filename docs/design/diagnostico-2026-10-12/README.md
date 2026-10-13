# Diagnóstico de design de 12/10/2026 (método Impeccable)

As três avaliações de design (n.privacy, portal n.360 e n.iso) foram feitas por revisores separados, sobre 144 capturas: 48 telas em cada uma das 3 cascas, com a API simulada. O detector rodou isolado delas. Notas Nielsen:

| Área | Nota |
|---|---|
| n.privacy | 18/40 |
| portal n.360 | 20/40 |
| n.iso | 24/40 |

Ondas de correção:
- **Onda 1 (este PR):** todos os P0, mais a casca das três e o P1 de n.privacy e do portal n.360.
- **Onda 2:** P1 do n.iso e o estado vazio único.
- **Onda 3:** P2.

Geometria: o sistema é quadrado. Onde uma linha abaixo cita raio de 10px em botão ou campo, a regra vigente
está em [`design.md`](../../../design.md): os 10px das classes em `style.css` são sobrepostos pelo bloco do fim do
arquivo, e o 10px que ainda aparece vem do inline das telas e de cinco classes fora da sobreposição.

Cada arquivo traz a tabela por tela, com problema, evidência, correção e severidade. Leia o estado atual no código antes de seguir uma linha: as linhas da Onda 1 já foram corrigidas.
