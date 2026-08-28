# Rosarium

Aplicativo católico tradicional para rezar o **Santo Terço** e o **Santo Rosário completo**, em português e latim. Funciona offline como PWA e é empacotado para Android com Capacitor.

> *Ad Iesum per Mariam — Salve Maria e Viva Cristo Rei.*

## Ver o aplicativo no navegador

A versão mais recente da interface é publicada automaticamente em:

**https://arthurreis99.github.io/rosarium/**

Ela usa exatamente os arquivos web que entram no APK, então serve para conferir a navegação, os textos e a aparência antes de compilar o Android.

## Recursos

- Santo Terço com os Mistérios Gozosos, Dolorosos e Gloriosos, sem os Mistérios Luminosos.
- Santo Rosário completo com quinze mistérios, Salve-Rainha, Ladainha Lauretana e oração final.
- Português ou latim como idioma principal, sempre com tradução no idioma complementar.
- Biblioteca de orações bilíngue e pesquisável.
- Progresso salvo no dispositivo, navegação por mistérios e por Ave-Marias.
- Tamanho de texto, modo foco, temas e opção de manter a tela ligada.
- Fontes e recursos empacotados para funcionamento integralmente offline.
- Marca interna com transparência real e ícones PWA/Android gerados automaticamente a partir da arte-mestra.

## Baixar o APK

1. Abra a aba **Actions** deste repositório.
2. Entre na execução mais recente de **Android · Build APK**.
3. Na seção **Artifacts**, baixe o arquivo `Rosarium-v...-debug.apk`.

O APK de teste é recriado automaticamente a cada alteração enviada para `main`. Não é necessário substituir ou apagar manualmente o `index.html`.

## Desenvolvimento

Requisitos: Node.js 22 e Java 21.

```bash
npm ci
npm run check
npm run build:apk
```

O APK será criado em `android/app/build/outputs/apk/debug/app-debug.apk`. Consulte [docs/BUILD.md](docs/BUILD.md) para o fluxo completo.

## Estrutura

```text
assets/brand/       arte-mestra da identidade visual
scripts/            automação de fontes, ícones, validação e Android
www/                aplicação web distribuída no PWA e no APK
  assets/           fontes, marca e ícones gerados
  scripts/          dados litúrgicos e lógica do aplicativo
  styles/           identidade visual e responsividade
.github/workflows/  compilação automatizada do APK
```

## Autoria

Criado por **Arthur Medeiros**.
