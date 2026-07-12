---
name: wacrm — Pyvo CRM
description: CRM de WhatsApp para donas de clínica de estética, com a identidade Pyvo (verde floresta, ouro velho, cream).
colors:
  floresta: "oklch(0.32 0.049 151.2)"
  floresta-hover: "oklch(0.363 0.054 151.2)"
  folha-profunda: "oklch(0.242 0.029 156.1)"
  cream: "oklch(0.939 0.022 82)"
  areia: "oklch(0.842 0.042 81.7)"
  areia-dourada: "oklch(0.715 0.058 78)"
  ouro-velho: "oklch(0.605 0.072 75)"
  ouro-claro: "oklch(0.735 0.098 81.2)"
  tinta: "oklch(0.21 0.008 84.6)"
  card-white: "oklch(1 0 0)"
  card-2: "oklch(0.918 0.020 82)"
  muted-foreground: "oklch(0.50 0.022 74)"
  destructive: "oklch(0.577 0.245 27.325)"
typography:
  display:
    fontFamily: "Italiana, serif"
    fontSize: "28px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "normal"
  heading:
    fontFamily: "Space Grotesk, var(--font-space-grotesk), sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Space Grotesk, var(--font-space-grotesk), sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.375
    letterSpacing: "-0.02em"
  body:
    fontFamily: "DM Sans, var(--font-sans), sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "DM Sans, var(--font-sans), sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.02em"
rounded:
  sm: "calc(var(--radius) * 0.6)"
  md: "calc(var(--radius) * 0.8)"
  lg: "var(--radius)"
  xl: "calc(var(--radius) * 1.4)"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
components:
  button-primary:
    backgroundColor: "{colors.floresta}"
    textColor: "{colors.cream}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "{colors.floresta-hover}"
    textColor: "{colors.cream}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.tinta}"
    rounded: "{rounded.lg}"
  card:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.xl}"
    padding: "16px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.tinta}"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "4px 10px"
---

# Design System: wacrm — Pyvo CRM

## 1. Overview

**Creative North Star: "O Ateliê de Confiança"**

O sistema visual da Pyvo se comporta como um ateliê bem cuidado, não
como um painel de SaaS. O verde-musgo sofisticado da Floresta e o
dourado de fim de tarde do Ouro Velho fazem o papel da madeira e do
latão de um espaço artesanal: materiais que envelhecem bem e
transmitem mérito, não brilho fácil. O cream e a areia dão o respiro
de um ambiente iluminado naturalmente, nunca clínico ou frio — mesmo
sendo, no fim das contas, software para donas de clínica de estética.

A usuária não é gestora de formação; é uma esteticista que constrói
um negócio sem nunca ter sido ensinada a lê-lo. A interface existe
para tornar visível o que estava escondido — sem intimidar. Cada tela
resolve **uma** pergunta de cada vez ("onde está meu dinheiro / qual
minha próxima ação"), ecoando o método de "uma restrição por mês" que
sustenta o produto: não é falta de dados, é falta de foco.

Este sistema rejeita explicitamente o clichê de SaaS genérico —
dashboards azul/roxo, gradientes decorativos, grades de cards
idênticos, o "hero metric" de startup. Também rejeita a frieza
hospitalar: mesmo tratando de números e processos, o tom é de cuidado
humano, não de sistema administrativo impessoal.

**Key Characteristics:**
- Paleta terrosa e premium (floresta + ouro), nunca tech-saturada (azul/roxo/neon)
- Sidebar sempre escura — um "corredor" fixo e confiável, independente do modo claro/escuro do conteúdo
- Componentes discretos e precisos: pouco ornamento, cantos moderadamente arredondados, foco no conteúdo
- Cards sem sombra — profundidade vem de um anel sutil (`ring-1 ring-foreground/10`), não de `box-shadow`
- Tipografia em três papéis bem separados: Italiana só para a wordmark, Space Grotesk para títulos de interface, DM Sans para tudo que é corpo/microcopy

## 2. Colors: The Atelier Palette

Uma paleta terrosa e contida — verde-musgo profundo como base de confiança, dourado envelhecido como o único acento que se permite brilhar, cream e areia como luz ambiente.

### Primary
- **Floresta** (`#1F3A26` / `oklch(0.32 0.049 151.2)`): verde-musgo sofisticado e confiável. Cor primária no modo claro — botões primários, links, foco, ícone ativo. Também é o fundo constante da sidebar em ambos os modos.
- **Floresta Hover** (`oklch(0.363 0.054 151.2)`): um tom acima da Floresta, usado apenas em estados de hover/press do primário.

### Secondary
- **Ouro Velho** (`#B08A4A` / `oklch(0.605 0.072 75)`): dourado de fim de tarde, envelhecido — usado como acento pontual sobre fundos cream/claros (nunca como cor de área grande).
- **Ouro Claro** (`#C9A35E` / `oklch(0.735 0.098 81.2)`): a mesma família dourada, aclarada para ter contraste sobre fundos escuros — vira a cor primária no modo escuro e o acento ativo da sidebar em ambos os modos.

### Neutral
- **Cream** (`#F4EDE0` / `oklch(0.939 0.022 82)`): fundo principal no modo claro — luz ambiente, nunca branco puro.
- **Areia** (`#D9C9AD` / `oklch(0.842 0.042 81.7)`): bordas e inputs no modo claro — o traço de apoio, nunca cinza neutro.
- **Areia Dourada** (`oklch(0.715 0.058 78)`): texto padrão da sidebar — legível sobre o verde escuro sem competir com o Ouro Claro ativo.
- **Folha Profunda** (`#14241A` / `oklch(0.242 0.029 156.1)`): fundo principal no modo escuro.
- **Tinta** (`#1A1814` / `oklch(0.21 0.008 84.6)`): texto no modo claro — nunca preto puro.
- **Card White** (`oklch(1 0 0)`): único branco puro do sistema, reservado para a superfície de cards no modo claro (contraste com o cream do fundo).
- **Destructive** (`oklch(0.577 0.245 27.325)`): vermelho reservado só para ações destrutivas e erro — nunca decorativo.

### Named Rules
**A Regra do Ouro Raro.** Ouro Velho/Claro nunca vira cor de fundo de área grande. É reservado para o item ativo, o CTA de maior prioridade da tela, ou o beta/status chip — sua raridade é o que sustenta o efeito "premium".

**A Regra da Sidebar Constante.** A sidebar é sempre Floresta escura, mesmo quando o conteúdo principal está em modo claro — é o "corredor" fixo do ateliê, o ponto de orientação que não muda com o tema.

## 3. Typography

**Display Font:** Italiana (com fallback serif)
**Heading Font:** Space Grotesk (com fallback sans-serif)
**Body Font:** DM Sans (com fallback sans-serif)

**Character:** Italiana é reservada só para o wordmark "PYVO" — um traço editorial, quase de casa de moda, que nunca aparece em corpo de texto. Space Grotesk assume os títulos de interface: geométrica, confiante, levemente técnica. DM Sans carrega todo o resto — corpo, labels, microcopy — humana e legível em densidade de dashboard.

### Hierarquia
- **Display** (Italiana, 400, 28px, line-height 1): exclusivo do wordmark "PYVO" na sidebar/login. Nunca usado para copy de produto.
- **Heading** (Space Grotesk, 700, 1.5rem/24px, line-height 1.25, letter-spacing -0.02em): título de página (ex.: "Dashboard").
- **Title** (Space Grotesk, 500, 1rem/16px, line-height 1.375, letter-spacing -0.02em): título de card/seção.
- **Body** (DM Sans, 400, 0.875rem/14px, line-height 1.5): texto padrão de interface — a maioria dos componentes (botão, input, card) usa este tamanho como base. Limite de leitura confortável: 65–75ch em blocos de texto corrido.
- **Label** (DM Sans, 600, 0.75rem/12px, letter-spacing 0.02em): metadados, badges, chips de papel/beta — geralmente em uppercase quando é um chip de status.

### Named Rules
**A Regra do Wordmark Único.** Italiana aparece em exatamente um lugar por tela: o logo. Se uma segunda ocorrência de Italiana aparecer em copy de produto, é erro — não é reforço de marca, é diluição.

## 4. Elevation

O sistema é essencialmente plano: cards não usam `box-shadow`, e a profundidade vem de um anel de contorno sutil (`ring-1 ring-foreground/10`) combinado com a diferença de tom entre o fundo (cream/folha) e a superfície do card (branco puro no claro, um tom acima da folha no escuro). Popovers, dropdowns e sheets usam o `ring-border` do sistema em vez de sombra projetada — o objetivo é nitidez de borda, não profundidade dramática.

### Named Rules
**A Regra do Anel, Não da Sombra.** Separação de superfície é comunicada por um anel de 1px em `foreground/10`, nunca por `box-shadow` difusa. Se uma sombra aparecer sob um card em repouso, está fora do sistema.

## 5. Components

### Buttons
- **Shape:** cantos moderadamente arredondados (`rounded-lg`, ~10px em telas pequenas via `--radius-md`).
- **Primary:** fundo Floresta (`--primary`), texto cream (`--primary-foreground`), altura 32px (`h-8`), padding horizontal 10px. Hover sobe para Floresta Hover.
- **Outline:** fundo transparente, borda Areia/`--border`, hover preenche com `--muted`.
- **Ghost:** sem fundo/borda em repouso, hover preenche com `--muted`.
- **Destructive:** fundo destructive a 10% de opacidade, texto destructive sólido — nunca vermelho cheio, mesmo em ação destrutiva.
- **Hover / Focus:** transição suave de cor de fundo; foco visível via anel de 3px em `ring/50` mais borda `ring`; ao clicar, um leve `translateY(1px)` reforça o toque físico.

### Chips / Badges
- **Style:** pílula (`rounded-4xl`), altura 20px, padding 8px horizontal, texto 12px.
- **Variantes:** `default` usa fundo Floresta; chips de papel (Proprietário/Admin/Beta) usam cor semântica própria (ex.: âmbar para "Proprietário", `sidebar-primary`/ouro para "Admin") sobre fundo a 10% de opacidade e borda a 40%.

### Cards / Containers
- **Corner Style:** `rounded-xl` (mais arredondado que botões — o card é o container "macio" do sistema).
- **Background:** branco puro no modo claro (contraste deliberado com o cream do fundo geral), um tom acima da Folha no modo escuro.
- **Shadow Strategy:** nenhuma — ver seção Elevation. Separação vem do `ring-1 ring-foreground/10`.
- **Internal Padding:** 16px (`py-4`, `px-4` no header/content), reduzindo para 12px na variante `size="sm"`.

### Inputs / Fields
- **Style:** fundo transparente, borda Areia/`--input`, `rounded-lg`, altura 32px, texto 14px (16px em telas pequenas para evitar zoom automático no iOS).
- **Focus:** borda muda para `--ring` (Floresta/Ouro conforme o modo) mais anel de 3px em `ring/50`.
- **Error / Disabled:** erro usa borda + anel destructive; desabilitado reduz opacidade e usa fundo `input/50`.

### Navigation (Sidebar)
- **Style:** fundo Floresta constante (independente do tema do conteúdo), 240–256px de largura, item ativo com borda esquerda de 2px em Ouro Claro + fundo `sidebar-accent` + texto Ouro Claro; item inativo em Areia Dourada com hover suave.
- **Typography:** DM Sans 14px/500 para todos os itens.
- **Mobile:** vira drawer fixo com overlay translúcido (`bg-background/70 backdrop-blur-sm`) e transição de `translate-x`.

## 6. Do's and Don'ts

### Do:
- **Do** manter a sidebar sempre em Floresta escura, mesmo quando o conteúdo está em modo claro — é o "corredor" fixo do ateliê.
- **Do** reservar Ouro Velho/Claro para estados ativos e o CTA de maior prioridade — a raridade é o que sustenta a sensação premium.
- **Do** usar `ring-1 ring-foreground/10` para separar superfícies, nunca `box-shadow`.
- **Do** manter Italiana exclusiva ao wordmark; Space Grotesk para títulos; DM Sans para todo o resto.
- **Do** escrever microcopy e estados vazios com calor humano — a usuária é esteticista, não gestora, e o produto vende "controle e tranquilidade", não "método" ou "assessoria".

### Don't:
- **Don't** usar gradientes decorativos, `background-clip: text`, ou paleta azul/roxo — é o clichê de SaaS genérico que este sistema rejeita explicitamente.
- **Don't** empilhar grades de cards idênticos com ícone + título + texto — o "template de SaaS" que o produto PYVO existe para não parecer.
- **Don't** usar o "hero metric" de startup (número grande + label pequeno + gradiente de fundo) como padrão de dashboard.
- **Don't** deixar a interface parecer fria ou hospitalar — mesmo sendo software para clínica, o tom é de cuidado humano, não de sistema clínico impessoal.
- **Don't** aplicar `box-shadow` a um card em repouso — profundidade vem do anel de contorno, não de sombra projetada.
- **Don't** usar mais de um Italiana por tela — a segunda ocorrência dilui a marca em vez de reforçá-la.
