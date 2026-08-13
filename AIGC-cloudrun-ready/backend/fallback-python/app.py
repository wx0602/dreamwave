import json, os, datetime, random
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# --- 路径配置优化 ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RUNTIME_DIR = os.path.join(BASE_DIR, 'runtime')
SAVES_DIR = os.path.join(RUNTIME_DIR, 'saves') # 存档文件夹

# 确保文件夹存在
for path in [RUNTIME_DIR, SAVES_DIR]:
    if not os.path.exists(path):
        os.makedirs(path)

# --- 核心：一人一档逻辑 ---
def get_user_file(user_id):
    """根据 User-Id 确定存档路径"""
    return os.path.join(SAVES_DIR, f'user_{user_id}.json')

def get_db(user_id):
    """读取指定用户的数据库，若不存在则返回初始模板"""
    file_path = get_user_file(user_id)
    if not os.path.exists(file_path):
        return {
            "user": {"nickname": "新勇者", "currentChapter": "序章", "currentGoal": "未设定"},
            "agent": {"selectedRole": "scholar", "level": 1, "growthValue": 0, "resourcePoints": 0},
            "tasks": [],
            "diary": [],
            "inventory": [],
            "shopItems": []
        }
    with open(file_path, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_db(user_id, data):
    """将数据保存到对应的用户文件"""
    file_path = get_user_file(user_id)
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)

def wrap_response(data=None, message="success", code=200, success=True):
    """统一响应格式"""
    return jsonify({
        "code": code,
        "message": message,
        "data": data,
        "success": success
    })

# --- ApiService 接口实现 ---

@app.route('/api/roles', methods=['GET'])
def get_roles():
    roles = [
        {"id": "knight", "name": "破关者", "description": "冲刺型 · 目标导向", "icon": "role_breaker"},
        {"id": "scholar", "name": "洞察者", "description": "理解型 · 概念导向", "icon": "role_insight"},
        {"id": "steady", "name": "稳进者", "description": "节奏型 · 习惯导向", "icon": "role_steady"}
    ]
    return wrap_response(data=roles)

@app.route('/api/init', methods=['POST'])
def init_agent():
    # 从 Header 获取 User-Id，若无则默认为 guest
    user_id = request.headers.get('User-Id', 'guest')
    req = request.json
    
    db = get_db(user_id)
    db["user"] = {
        "nickname": req.get("name", "未命名勇者"),
        "currentChapter": "序章：启程",
        "currentGoal": req.get("goal", "新的征程")
    }
    db["agent"] = {
        "selectedRole": req.get("roleId", "scholar"),
        "status": "active",
        "level": 1,
        "growthValue": 0,
        "resourcePoints": 0
    }
    db["tasks"] = [
        {
            "id": 1001,
            "title": "初识语境之塔",
            "estimate_minutes": 5,
            "reward_growth": 10,
            "reward_resource": 5,
            "status": 0,
            "task_type": "main"
        }
    ]
    db["diary"] = []
    
    save_db(user_id, db)
    return wrap_response(data={"status": "initialized", "userId": user_id})

@app.route('/api/state', methods=['GET'])
def get_state():
    user_id = request.headers.get('User-Id', 'guest')
    db = get_db(user_id)
    
    # 保命检查与补全
    updated = False
    for key, default in [("user", {"nickname": "勇者"}), ("tasks", []), ("diary", []), ("agent", {"level": 1})]:
        if key not in db:
            db[key] = default
            updated = True
    
    if updated:
        save_db(user_id, db)
        
    return wrap_response(data=db)

@app.route('/api/tasks/<taskId>/complete', methods=['POST'])
def complete_task(taskId):
    user_id = request.headers.get('User-Id', 'guest')
    db = get_db(user_id)
    try:
        tid = int(float(taskId)) 
        for task in db["tasks"]:
            if task["id"] == tid:
                if task["status"] == 2:
                    return wrap_response(message="Task already completed", code=400, success=False)
                
                task["status"] = 2
                growth = task.get("reward_growth", 0)
                res = task.get("reward_resource", 0)
                db["agent"]["growthValue"] = db["agent"].get("growthValue", 0) + growth
                db["agent"]["resourcePoints"] = db["agent"].get("resourcePoints", 0) + res
                
                # 记录日记
                now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
                new_log = {
                    "id": int(datetime.datetime.now().timestamp()),
                    "date": now_str,
                    "content": f"成功结算任务「{task['title']}」，获得成长值+{growth}，资源点+{res}。",
                    "type": "task_completion"
                }
                if "diary" not in db: db["diary"] = []
                db["diary"].insert(0, new_log)
                
                save_db(user_id, db)
                return wrap_response(data={"status": "success", "taskId": str(tid)})
                
        return wrap_response(message="Task not found", code=404, success=False)
    except Exception as e:
        return wrap_response(message=str(e), code=500, success=False)

@app.route('/api/tasks/custom', methods=['POST'])
def add_custom_task():
    user_id = request.headers.get('User-Id', 'guest')
    db = get_db(user_id)
    req = request.json
    
    title = req.get("title", "未命名任务")
    new_task = {
        "id": random.randint(2000, 9999),
        "title": title,
        "estimate_minutes": 15,
        "reward_growth": 5,
        "reward_resource": 2,
        "status": 0,
        "task_type": "custom"
    }
    
    if "tasks" not in db: db["tasks"] = []
    db["tasks"].append(new_task)
    save_db(user_id, db)
    
    return wrap_response(data=new_task)

@app.route('/api/dungeon/status', methods=['GET'])
def dungeon_status():
    is_demo = request.args.get('demo') == '1'
    now = datetime.datetime.now()
    is_open = is_demo or (now.hour >= 22)
    data = {"isOpen": is_open, "currentTime": now.strftime("%H:%M")}
    return wrap_response(data=data)

@app.route('/api/shop/purchase', methods=['POST'])
def purchase():
    user_id = request.headers.get('User-Id', 'guest')
    # 这里可以增加扣除 resourcePoints 的逻辑
    return wrap_response(data={"result": "purchased"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3001, debug=True)
