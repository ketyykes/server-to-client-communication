// 引入需要的套件
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { WebSocketServer } from 'ws';
import http from 'http';

// 設定 dotenv
dotenv.config();

// 建立 Express 應用程式
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// 設定 CORS
app.use(cors());
app.use(express.static("client"));

// 取得環境變數
const port = process.env.PORT || 3000;

// 儲存目前的內容
let currentContent = {
	imageUrl: "https://picsum.photos/400/300?random=1",
	message: "歡迎使用！",
};

// 儲存所有連接的客戶端
let sseClients = [];
let wsClients = new Set();
let longPollingClients = [];

// 訊息陣列
const messages = [
	"今天是個美好的一天！",
	"加油！你可以的！",
	"記得喝水休息喔！",
	"保持微笑！",
	"享受當下的時光",
];

// 更新內容的函式（純粹更新內容）
function updateContent() {
	const randomMessage = messages[Math.floor(Math.random() * messages.length)];
	const randomNum = Math.floor(Math.random() * 1000);
	currentContent = {
		imageUrl: `https://picsum.photos/400/300?random=${randomNum}`,
		message: randomMessage,
	};
	return currentContent;
}

// 通知所有 SSE 客戶端的函式
function notifySseClients(content) {
	sseClients.forEach((client) => {
		client.res.write(`data: ${JSON.stringify(content)}\n\n`);
	});
}

// 通知所有 WebSocket 客戶端的函式
function notifyWsClients(content) {
	wsClients.forEach((client) => {
		if (client.readyState === 1) { // 確認連線狀態為 OPEN
			client.send(JSON.stringify(content));
		}
	});
}

// 定時更新的函式
function scheduleNextUpdate() {
	const nextUpdateTime = Math.random() * (15000 - 5000) + 5000;
	setTimeout(() => {
		const newContent = updateContent();
		notifySseClients(newContent);
		notifyWsClients(newContent);
		
		// 處理 Long Polling 客戶端
		longPollingClients.forEach(client => {
			clearTimeout(client.timeout);
			client.res.json(newContent);
		});
		longPollingClients = [];
		
		scheduleNextUpdate();
	}, nextUpdateTime);
}

// WebSocket 連線處理
wss.on('connection', (ws) => {
	console.log('新的 WebSocket 連線');
	wsClients.add(ws);
	
	// 發送當前內容
	ws.send(JSON.stringify(currentContent));

	// 連線關閉時移除客戶端
	ws.on('close', () => {
		wsClients.delete(ws);
		console.log('WebSocket 連線關閉');
	});
});

// 啟動定時更新
scheduleNextUpdate();

// 設定 SSE 路由
app.get("/events", (req, res) => {
	res.writeHead(200, {
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache",
		Connection: "keep-alive",
	});

	res.write(`data: ${JSON.stringify(currentContent)}\n\n`);

	const clientId = Date.now();
	const newClient = {
		id: clientId,
		res,
	};
	sseClients.push(newClient);

	req.on("close", () => {
		sseClients = sseClients.filter((client) => client.id !== clientId);
	});
});

// 取得目前內容的路由
app.get("/random", (req, res) => {
	res.json(currentContent);
});

// 一般 Polling 路由
app.get("/polling", (req, res) => {
	res.json(currentContent);
});

// Long Polling 路由
app.get("/long-polling", (req, res) => {
	const clientId = Date.now();
	
	// 建立超時處理
	const timeout = setTimeout(() => {
		// 如果 30 秒內沒有新的更新，返回目前的內容
		res.json(currentContent);
		longPollingClients = longPollingClients.filter(client => client.id !== clientId);
	}, 30000);

	// 儲存客戶端資訊
	const clientInfo = {
		id: clientId,
		res,
		timeout
	};
	
	longPollingClients.push(clientInfo);

	// 當客戶端斷開連接時清理資源
	req.on('close', () => {
		clearTimeout(timeout);
		longPollingClients = longPollingClients.filter(client => client.id !== clientId);
	});
});

// 啟動伺服器
server.listen(port, () => {
	console.log(`伺服器執行於 http://localhost:${port}`);
});
