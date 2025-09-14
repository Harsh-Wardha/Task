@echo off
echo Starting Node.js Microservices Demo...
echo.

echo ========================================
echo 1. Starting Agent Demo Service (Port 3001)
echo ========================================
start "Agent Demo" cmd /k "cd services\agent_demo && npm run dev"

timeout /t 3 /nobreak > nul

echo ========================================
echo 2. Starting Agent Custom Service (Port 3002)
echo ========================================
start "Agent Custom" cmd /k "cd services\agent_custom && npm run dev"

timeout /t 5 /nobreak > nul

echo ========================================
echo Services are starting up...
echo ========================================
echo.
echo Agent Demo Service:    http://localhost:3001/health
echo Agent Custom Service:  http://localhost:3002/health
echo Agent Custom Run:      http://localhost:3002/run
echo.
echo Press any key to test the endpoints...
pause > nul

echo.
echo ========================================
echo Testing Agent Demo Health Endpoint
echo ========================================
curl -s http://localhost:3001/health | echo.

echo.
echo ========================================
echo Testing Agent Custom Health Endpoint
echo ========================================
curl -s http://localhost:3002/health | echo.

echo.
echo ========================================
echo Testing Agent Custom Run Endpoint
echo ========================================
curl -s -X POST http://localhost:3002/run -H "Content-Type: application/json" -d "{\"test\": \"data\"}" | echo.

echo.
echo ========================================
echo Demo completed! Check the service windows for logs.
echo ========================================
pause

