@echo off
title Colorir Magico - Criador de Livros
cd /d "%~dp0"

echo.
echo   ================================
echo     Colorir Magico - Instalador
echo   ================================
echo.

REM ---- 1. Verifica Node.js ----
where node >nul 2>nul
if errorlevel 1 goto semnode

echo  [OK] Node.js encontrado.
node --version

REM ---- 2. Instala dependencias ----
echo.
echo  Instalando dependencias...
call npm install --silent --no-audit --no-fund 2>nul
if errorlevel 1 goto aviso_deps
echo  [OK] Dependencias prontas.
goto checa_env

:aviso_deps
echo  [AVISO] npm install teve avisos, mas vamos continuar.

:checa_env
REM ---- 3. Verifica .env ----
if not exist ".env" goto semenv

REM ---- 4. Inicia servidor + abre navegador ----
echo.
echo   Iniciando Colorir Magico...
echo   Deixe esta janela aberta enquanto usar.
echo.

start "" "http://localhost:4567"
node server.mjs
if errorlevel 1 goto erro_server
goto fim

:semnode
echo.
echo  [ERRO] Node.js nao encontrado neste computador.
echo.
echo  Para usar o Colorir Magico, instale o Node.js:
echo  1. Acesse https://nodejs.org
echo  2. Baixe a versao LTS - botao verde a esquerda
echo  3. Instale dando Next ate o fim - deixe tudo padrao
echo  4. Feche esta janela e de dois cliques no iniciar.bat de novo
echo.
pause
goto fim

:semenv
echo.
echo  [ERRO] Arquivo .env nao encontrado.
echo  Peca para quem configurou o Colorir Magico criar o .env com as chaves.
echo.
pause
goto fim

:erro_server
echo.
echo  O servidor parou. Veja o erro acima.
echo.
pause

:fim
