# Compilação do Rosarium

## Fluxo recomendado pelo GitHub

Qualquer envio para a branch `main` inicia o workflow **Android · Build APK**. Ele:

1. instala exatamente as versões registradas no `package-lock.json`;
2. copia as fontes locais e gera os ícones;
3. valida a estrutura e a ausência dos Mistérios Luminosos;
4. cria a plataforma Android em ambiente limpo;
5. sincroniza o conteúdo de `www/` com o Capacitor;
6. compila e publica um APK nomeado com versão e commit.

Também é possível iniciar a compilação manualmente em **Actions → Android · Build APK → Run workflow**.

## Desenvolvimento local

```bash
npm ci
npm run check
npm run android:prepare
cd android
./gradlew assembleDebug
```

Depois da primeira preparação, use `npm run android:sync` para sincronizar alterações. A pasta `android/` é gerada e ignorada pelo Git: o resultado permanece reproduzível porque Capacitor, Node e dependências estão fixados.

## Publicação na Play Store

O APK produzido automaticamente é de teste. Uma versão pública deve usar um Android App Bundle (`.aab`) assinado por uma chave privada mantida fora do repositório. Nunca envie arquivos `.jks`, senhas ou chaves para o GitHub.
