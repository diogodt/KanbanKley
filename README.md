# KanbanKley

Kanban local, leve e sem backend.

## Rodar

```powershell
npm install
npm run dev
```

## Build

```powershell
npm run build
npm run lint
```

## GitHub Pages

O deploy roda por GitHub Actions quando a branch `main` recebe push.

O workflow usa:

```txt
GITHUB_PAGES=true
```

Com isso o Vite gera os assets com base `/KanbanKley/`, que e o caminho esperado para:

```txt
https://diogodt.github.io/KanbanKley/
```

## Persistencia

O quadro inteiro fica no `localStorage` do navegador, na chave:

```txt
kanbankley:v2
```

Essa chave guarda colunas, cards, imagens das tarefas e tema. A versao atual tambem migra cards antigos que estavam em `kanbankley:v1`.

Imagens ficam salvas como data URLs dentro do `localStorage`, com limite de 8 imagens por tarefa e 2 MB por arquivo.

Limpar dados do site ou trocar de navegador/perfil remove o quadro local.
