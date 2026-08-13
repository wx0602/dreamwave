#!/usr/bin/env python3
from __future__ import annotations

import html
import subprocess
import textwrap
from pathlib import Path


ROOT = Path(__file__).resolve().parent
ASSET_DIR = ROOT / "submission_assets"
MD_PATH = ROOT / "自律者联盟_作品说明书.md"
DOCX_PATH = ROOT / "自律者联盟_作品说明书.docx"

FONT_STACK = "Droid Sans Fallback, Microsoft YaHei, Noto Sans CJK SC, sans-serif"
COLORS = {
    "primary": "#6FB6FF",
    "primary_dark": "#4F9EF0",
    "accent": "#A9D4FF",
    "text": "#2F3440",
    "text_secondary": "#6C7A89",
    "hint": "#9AA6B2",
    "bg": "#F4F9FF",
    "white": "#FFFFFF",
    "success": "#69B98A",
    "warning": "#D9A679",
    "line": "#D9EAF7",
    "chip": "#DCEEFF",
}


def wrap_text(text: str, size: int) -> list[str]:
    text = text.strip()
    if not text:
        return []
    lines = []
    current = ""
    for ch in text:
        current += ch
        if len(current) >= size:
            lines.append(current)
            current = ""
    if current:
        lines.append(current)
    return lines


def svg_text(x: int, y: int, text: str, font_size: int = 18, fill: str | None = None,
             weight: str = "normal", anchor: str = "start", line_height: int | None = None) -> str:
    fill = fill or COLORS["text"]
    line_height = line_height or int(font_size * 1.45)
    lines = text.split("\n")
    escaped = [html.escape(line) for line in lines]
    if len(escaped) == 1:
        return (
            f'<text x="{x}" y="{y}" font-family="{FONT_STACK}" font-size="{font_size}" '
            f'fill="{fill}" font-weight="{weight}" text-anchor="{anchor}">{escaped[0]}</text>'
        )
    spans = []
    for idx, line in enumerate(escaped):
        dy = 0 if idx == 0 else line_height
        spans.append(f'<tspan x="{x}" dy="{dy}">{line}</tspan>')
    return (
        f'<text x="{x}" y="{y}" font-family="{FONT_STACK}" font-size="{font_size}" '
        f'fill="{fill}" font-weight="{weight}" text-anchor="{anchor}">{"".join(spans)}</text>'
    )


def rect(x: int, y: int, w: int, h: int, fill: str, stroke: str | None = None,
         radius: int = 24, stroke_width: int = 1, opacity: float | None = None) -> str:
    opacity_attr = f' opacity="{opacity}"' if opacity is not None else ""
    stroke_attr = f' stroke="{stroke}" stroke-width="{stroke_width}"' if stroke else ""
    return (
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" '
        f'fill="{fill}"{stroke_attr}{opacity_attr} />'
    )


def chip(x: int, y: int, w: int, h: int, label: str, fill: str = COLORS["chip"],
         color: str = COLORS["primary_dark"]) -> str:
    return "\n".join([
        rect(x, y, w, h, fill, radius=16),
        svg_text(x + w // 2, y + h // 2 + 6, label, 16, color, "bold", "middle"),
    ])


def button(x: int, y: int, w: int, h: int, label: str, fill: str = COLORS["primary"],
           color: str = COLORS["white"], radius: int = 22) -> str:
    return "\n".join([
        rect(x, y, w, h, fill, radius=radius),
        svg_text(x + w // 2, y + h // 2 + 7, label, 20, color, "bold", "middle"),
    ])


def field(x: int, y: int, w: int, label: str, value: str = "") -> str:
    return "\n".join([
        svg_text(x, y, label, 15, COLORS["text_secondary"]),
        rect(x, y + 10, w, 58, "#EEF5FC", radius=16),
        svg_text(x + 18, y + 47, value or "请输入内容", 17, COLORS["hint"]),
    ])


def task_card(x: int, y: int, w: int, title: str, detail: str, meta: str,
              fill: str = COLORS["white"]) -> str:
    detail_lines = wrap_text(detail, 23)
    detail_text = "\n".join(detail_lines[:2])
    return "\n".join([
        rect(x, y, w, 150, fill, COLORS["line"], radius=24, stroke_width=2),
        svg_text(x + 22, y + 36, title, 22, COLORS["text"], "bold"),
        svg_text(x + 22, y + 70, detail_text, 15, COLORS["text_secondary"]),
        chip(x + 22, y + 102, 146, 30, meta, COLORS["chip"], COLORS["primary_dark"]),
        chip(x + w - 160, y + 102, 138, 30, "奖励成长/资源", "#EEF8F1", COLORS["success"]),
    ])


def item_card(x: int, y: int, w: int, title: str, subtitle: str, price: str) -> str:
    return "\n".join([
        rect(x, y, w, 166, COLORS["white"], COLORS["line"], radius=24, stroke_width=2),
        rect(x + 20, y + 18, 72, 72, "#EAF4FF", radius=20),
        svg_text(x + 56, y + 62, "道具", 18, COLORS["primary_dark"], "bold", "middle"),
        svg_text(x + 20, y + 114, title, 20, COLORS["text"], "bold"),
        svg_text(x + 20, y + 140, subtitle, 14, COLORS["text_secondary"]),
        chip(x + w - 88, y + 22, 68, 28, price, "#FFF3E8", COLORS["warning"]),
    ])


def phone_shell(title: str, inner: str, subtitle: str = "") -> str:
    width, height = 860, 1560
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
<defs>
  <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#EAF4FF"/>
    <stop offset="100%" stop-color="#F7FBFF"/>
  </linearGradient>
</defs>
{rect(0, 0, width, height, "url(#bgGrad)", radius=0)}
{rect(70, 50, 720, 1460, "#1C2430", radius=58)}
{rect(95, 92, 670, 1376, COLORS["bg"], radius=44)}
{rect(328, 66, 204, 22, "#131922", radius=10)}
{svg_text(430, 140, title, 28, COLORS["text"], "bold", "middle")}
{svg_text(430, 176, subtitle, 15, COLORS["text_secondary"], anchor="middle")}
{inner}
</svg>"""


def figure_setup() -> str:
    content = [
        chip(158, 216, 130, 38, "初始化信息"),
        svg_text(430, 306, "填写初始化信息", 32, COLORS["text"], "bold", "middle"),
        svg_text(430, 346, "补充目标、角色与投入节奏，开始创建冒险档案", 16, COLORS["text_secondary"], anchor="middle"),
        rect(135, 388, 590, 760, COLORS["white"], COLORS["line"], radius=28, stroke_width=2),
        field(170, 438, 520, "登录账号", "study_runner"),
        field(170, 552, 520, "登录密码", "••••••••"),
        field(170, 666, 520, "昵称", "林舟"),
        field(170, 780, 520, "短期学习目标", "30 天完成 CET-6 冲刺与词汇复盘"),
        field(170, 894, 250, "截止时间", "30 天后"),
        field(440, 894, 250, "每日可投入时长", "2 小时"),
        svg_text(170, 1018, "角色模板", 15, COLORS["text_secondary"]),
        chip(170, 1034, 146, 36, "守望骑士", "#EEF5FC", COLORS["primary_dark"]),
        chip(332, 1034, 146, 36, "奥术学者", COLORS["primary"], COLORS["white"]),
        chip(494, 1034, 146, 36, "荒野旅人", "#EEF5FC", COLORS["primary_dark"]),
        button(170, 1088, 520, 62, "确认初始化"),
    ]
    return phone_shell("界面示意图 1", "\n".join(content), "角色建档与目标初始化页")


def figure_home() -> str:
    content = [
        rect(120, 214, 620, 170, "#F7FBFF", COLORS["line"], radius=28, stroke_width=2),
        svg_text(160, 274, "待办", 34, COLORS["text"], "bold"),
        chip(636, 238, 62, 34, "+", COLORS["chip"], COLORS["primary_dark"]),
        svg_text(160, 320, "当前章节：词海远征序章", 16, COLORS["text_secondary"]),
        svg_text(160, 350, "目标：30 天完成 CET-6 冲刺与词汇复盘", 16, COLORS["text_secondary"]),
        task_card(120, 416, 620, "背诵 40 个高频词", "从高频与真题词汇切入，先降低启动门槛，形成第一轮推进。", "25 分钟"),
        task_card(120, 588, 620, "精读 1 篇阅读训练", "把输入转化为语境理解，并为后续剧情反馈提供阶段性证据。", "30 分钟"),
        task_card(120, 760, 620, "整理 5 道错题并复盘", "通过输出与纠错完成闭环，把一次努力沉淀为可复用经验。", "20 分钟"),
        rect(120, 938, 620, 110, "#EEF5FC", COLORS["line"], radius=26, stroke_width=2),
        svg_text(150, 992, "完成任务后会生成剧情反馈、奖励结算与角色记忆", 18, COLORS["text_secondary"]),
    ]
    return phone_shell("界面示意图 2", "\n".join(content), "主任务主页与成长反馈入口")


def figure_dungeon() -> str:
    content = [
        rect(120, 226, 620, 224, "#FBFEFF", COLORS["line"], radius=28, stroke_width=2),
        svg_text(160, 288, "夜间副本已开放", 30, COLORS["text"], "bold"),
        svg_text(160, 336, "当前位面时间：22:13", 18, COLORS["text_secondary"]),
        svg_text(160, 372, "副本面板：HP 82 | 攻击 19 | 防御 14", 18, COLORS["text_secondary"]),
        chip(120, 474, 160, 40, "比赛演示模式"),
        button(120, 534, 620, 64, "进入副本"),
        svg_text(120, 664, "副本补给", 24, COLORS["text"], "bold"),
        rect(120, 690, 620, 62, COLORS["white"], COLORS["line"], radius=20, stroke_width=2),
        svg_text(150, 730, "当前资源点：46", 20, COLORS["primary_dark"], "bold"),
        svg_text(120, 790, "已购买道具会直接影响后续剧情分支。", 16, COLORS["text_secondary"]),
        item_card(120, 828, 298, "词汇符印", "解锁命名类分支", "18点"),
        item_card(442, 828, 298, "专注披风", "提升定意与续航", "24点"),
        item_card(281, 1018, 298, "洞察卷轴", "增强秘识判断", "20点"),
    ]
    return phone_shell("界面示意图 3", "\n".join(content), "夜间副本入口与补给商店")


def figure_dungeon_run() -> str:
    content = [
        rect(120, 258, 620, 950, "#FBFEFF", COLORS["line"], radius=28, stroke_width=2),
        svg_text(160, 322, "第 2 幕 / 共 4 幕", 18, COLORS["primary_dark"], "bold"),
        svg_text(160, 366, "月蚀书塔的失落回响", 26, COLORS["text"], "bold"),
        chip(160, 396, 180, 36, "秘识 4 · 共鸣 2 · 定意 3"),
        svg_text(160, 476, "观星穹顶的逆旋仪", 28, COLORS["text"], "bold"),
        svg_text(
            160,
            528,
            "\n".join(wrap_text("你沿着低语来到观星穹顶，逆旋仪正在把群星轨迹倒转。你必须决定，是直接解读未知真相，还是让灵灯与自己共同承担星压。", 22)),
            18,
            COLORS["text_secondary"],
        ),
        button(160, 676, 540, 68, "直接解读倒转星轨"),
        button(160, 766, 540, 68, "将星压分给守塔灵灯", fill="#88C4FF"),
        button(160, 856, 540, 68, "徒手稳住逆旋仪中轴", fill="#9BD0FF"),
        rect(160, 962, 540, 122, "#EEF5FC", COLORS["line"], radius=24, stroke_width=2),
        svg_text(188, 1012, "每次选择都会同步改变路线状态、即时奖励与结局走向。", 18, COLORS["text_secondary"]),
        button(160, 1108, 540, 66, "结算副本", fill="#C9D8E8"),
    ]
    return phone_shell("界面示意图 4", "\n".join(content), "剧情副本分支决策页")


def flow_box(x: int, y: int, w: int, h: int, title: str, body: str, fill: str = COLORS["white"]) -> str:
    wrapped = "\n".join(wrap_text(body, 18))
    return "\n".join([
        rect(x, y, w, h, fill, COLORS["line"], radius=24, stroke_width=2),
        svg_text(x + w // 2, y + 34, title, 21, COLORS["text"], "bold", "middle"),
        svg_text(x + 22, y + 70, wrapped, 15, COLORS["text_secondary"]),
    ])


def flow_arrow(x1: int, y1: int, x2: int, y2: int) -> str:
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{COLORS["primary_dark"]}" stroke-width="5" marker-end="url(#arrow)" />'


def flow_canvas(title: str, items: list[tuple[int, int, int, int, str, str]], arrows: list[tuple[int, int, int, int]]) -> str:
    width, height = 1600, 950
    body = [
        f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
<defs>
  <linearGradient id="flowBg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#EEF6FF"/>
    <stop offset="100%" stop-color="#F8FBFF"/>
  </linearGradient>
  <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
    <path d="M0,0 L0,6 L9,3 z" fill="#4F9EF0"/>
  </marker>
</defs>
""",
        rect(0, 0, width, height, "url(#flowBg)", radius=0),
        svg_text(width // 2, 72, title, 34, COLORS["text"], "bold", "middle"),
    ]
    for x, y, w, h, box_title, box_body in items:
        body.append(flow_box(x, y, w, h, box_title, box_body))
    for x1, y1, x2, y2 in arrows:
        body.append(flow_arrow(x1, y1, x2, y2))
    body.append("</svg>")
    return "\n".join(body)


def figure_flow_onboarding() -> str:
    items = [
        (60, 150, 320, 150, "1. 欢迎页", "打字动画建立仪式感，并提供注册/登录双入口。"),
        (430, 150, 320, 150, "2. 角色选择", "学者、骑士、旅者三条人格化成长路径。"),
        (800, 150, 320, 150, "3. 填写目标", "输入账号、目标、周期、每日可投入时间。"),
        (1170, 150, 320, 150, "4. 初始化 Agent", "生成主线章节、开场叙事与首批三项任务。"),
        (245, 470, 390, 170, "5. 查看初始化结果", "展示角色世界观、当前章节与任务清单，降低首次进入的认知负担。"),
        (930, 470, 420, 170, "6. 进入主页", "开始日常任务推进，并在后续形成连续成长闭环。"),
    ]
    arrows = [
        (380, 225, 430, 225),
        (750, 225, 800, 225),
        (1120, 225, 1170, 225),
        (1330, 300, 1090, 470),
        (800, 555, 930, 555),
        (585, 470, 585, 300),
    ]
    return flow_canvas("核心流程 A：建档与主线生成", items, arrows)


def figure_flow_taskloop() -> str:
    items = [
        (70, 140, 300, 150, "1. 选择任务", "从主线或支线任务中选择当下最小行动单元。"),
        (430, 140, 300, 150, "2. 开启专注之旅", "弹窗确认投入时长，可进入专注或直接结算。"),
        (790, 140, 300, 150, "3. 专注/休息双态", "专注计时与休息切换，降低疲劳导致的中断。"),
        (1150, 140, 300, 150, "4. 完成结算", "任务完成后进入剧情生成与奖励写入流程。"),
        (70, 500, 320, 180, "5. 剧情反馈卡", "展示故事文本、奖励总结与角色化反馈，放大正向感受。"),
        (450, 500, 320, 180, "6. 记忆入树", "写入 L1 短期记忆，并在必要时更新世界实体。"),
        (830, 500, 320, 180, "7. 主线收束", "若阶段任务完成，则生成章节终章并提示下一目标。"),
        (1210, 500, 320, 180, "8. 新赛季开启", "归档赛季纪要与称号，形成可持续成长履历。"),
    ]
    arrows = [
        (370, 215, 430, 215),
        (730, 215, 790, 215),
        (1090, 215, 1150, 215),
        (1300, 290, 1300, 500),
        (1210, 590, 1150, 590),
        (830, 590, 770, 590),
        (450, 590, 390, 590),
        (220, 500, 220, 290),
    ]
    return flow_canvas("核心流程 B：任务完成到剧情/记忆沉淀", items, arrows)


def write_svg(name: str, content: str) -> None:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    (ASSET_DIR / name).write_text(content, encoding="utf-8")


def build_markdown() -> str:
    return textwrap.dedent(
        """\
        ---
        title: "《自律者联盟》作品说明书"
        date: "2026年05月02日"
        lang: "zh-CN"
        ---

        # 作品名称

        《自律者联盟：剧情化目标拆解与成长陪伴系统》

        # 作品概述（200字左右，必须）

        《自律者联盟》面向备考学生、大学生与需要长期自我提升的年轻职场人，适用于四六级冲刺、编程学习、证书备考、阶段性技能训练等高频成长场景。作品将“长期目标”拆解为可执行的短任务，再把每一次真实完成的努力转写成带有角色设定、章节推进和成长奖励的冒险故事，解决传统待办工具“能记录、但难坚持”的问题。系统包含角色建档、目标初始化、主线任务生成、支线补充、专注计时、剧情反馈、记忆归档、夜间副本、补给商店、登录恢复等功能。其突出创新点在于：不是单纯用 AI 写几段好玩的文案，而是把目标规划、叙事反馈、记忆沉淀与世界状态长期绑定，形成真正可连续试用、可持续成长的自律闭环。

        **核心创新点：** 本作品把“大模型叙事能力”限制在一个可审计、可回溯、可延续的成长系统里，让用户每一次真实完成的任务，都能转化为角色成长、章节推进与长期记忆资产，而不是一次性的情绪刺激。

        # 设计背景与洞察（必须）

        当前大量效率工具擅长记录事项，却不擅长维持人真正的行动动力。用户常见的问题不是“不知道该做什么”，而是：

        - 长期目标过于抽象，启动门槛高，容易拖延。
        - 完成任务后的反馈过于机械，难以形成持续成就感。
        - 不少游戏化工具只做浅层积分或勾选，奖励与真实努力脱节。
        - 许多 AI 产品虽然能即时生成内容，但上下文容易丢失，难以支持连续数周的成长体验。

        基于这些洞察，本作品不把自己定义为“另一个待办清单”，而是定义为“把长期成长过程做成可持续世界线”的陪伴系统。它抓住的是一个更深层的问题：用户需要的不只是任务管理，而是能够把行动、反馈、身份认同与阶段成长连接起来的机制。

        # 理念贯穿性

        本作品的核心理念是“把抽象目标变成最小行动，把真实努力变成可积累的成长叙事”。这一理念贯穿了后续所有设计：

        - 在功能流程上，先让目标被拆解成三项可执行主线任务，再进入专注、结算、记忆、下一阶段的循环。
        - 在界面设计上，避免使用强压迫性的效率视觉，而用轻幻想、低负担的浅蓝卡片体系，把任务看起来更像“出发”而不是“被命令”。
        - 在交互设计上，每次完成任务后都不是简单弹出“已完成”，而是给予剧情卡、奖励总结、章节推进与下一步提示，让用户清楚感知自己的努力正在被系统“看见并保存”。

        **核心功能解读：** 作品最核心的卖点，是把“任务完成”从冷冰冰的勾选动作，升级为“专注执行 -> 成长结算 -> 剧情反馈 -> 记忆沉淀 -> 下一阶段推进”的连续体验。

        \\newpage

        # 作品的界面设计

        ## （1）整体视觉风格、色彩体系及理由

        作品整体采用“轻幻想叙事 + 清爽效率感”的视觉方向。不是厚重的游戏界面，也不是纯商务化待办界面，而是在两者之间找到平衡：

        - **视觉风格：** 轻幻想、卡片式、低负担、带一点像素冒险和世界观感。
        - **色彩体系：** 以浅蓝、雾白、低饱和灰蓝为主，搭配少量绿色/暖色作为奖励与状态提示色。
        - **设计理由：** 浅蓝系能降低焦虑感，也能对应作品中的“夜幕、星辉、魔法世界”意象；白色卡片提高信息可读性；局部强调色用于突出任务、奖励、状态，不让界面陷入花哨或失焦。

        这套风格服务于一个核心目标：让用户在打开应用时既感到“可进入”“有故事”，又不会因为过度游戏化而忽略真正的学习任务。

        ## （2）关键界面展示（必须）

        ![图1 初始化信息页示意图](submission_assets/ui_setup.svg){ width=60% }

        **图1说明：** 用户在这里完成账号、昵称、短期目标、周期与每日投入时长的填写，并选择角色模板。它既是注册页，也是“成长世界观”的入口，避免传统效率工具在第一步就显得冰冷和功能化。

        ![图2 主任务主页示意图](submission_assets/ui_home.svg){ width=60% }

        **图2说明：** 主页展示当前章节、当前目标和主线任务列表。任务颗粒度被控制在可立即行动的程度，同时保留添加支线与编辑任务的空间，兼顾系统引导与用户自主性。

        ![图3 夜间副本入口与补给页示意图](submission_assets/ui_dungeon.svg){ width=60% }

        **图3说明：** 夜间副本页不是额外的装饰功能，而是把白天积累的资源点、已购道具和晚间剧情体验连接起来，让“努力”在另一条玩法路径中获得新的意义。

        ![图4 剧情副本决策页示意图](submission_assets/ui_dungeon_run.svg){ width=60% }

        **图4说明：** 副本过程页会展示当前幕数、章节标题、路线状态和选择按钮。不同选择会改变结局走向，使用户感受到“自己的行动会真正影响故事”。

        \\newpage

        # 作品的交互设计

        ## （1）核心操作流程 1：建档与主线生成

        ![图5 建档与主线生成流程图](submission_assets/flow_onboarding.svg){ width=95% }

        **流程解读：**

        1. 欢迎页通过打字动画和双入口按钮建立进入感。
        2. 用户选择角色模板，决定叙事口径与成长人格。
        3. 用户填写目标、周期和每日投入，系统获得足够的目标上下文。
        4. 后端初始化 Agent、章节标题、开场叙事与首批主线任务。
        5. 用户先看到“我为什么会得到这些任务”，再进入主界面执行，降低第一天使用时的迷茫感。

        ## （1）核心操作流程 2：任务完成到剧情/记忆沉淀

        ![图6 任务完成到剧情沉淀流程图](submission_assets/flow_taskloop.svg){ width=95% }

        **流程解读：**

        1. 用户从主页选择任务，进入“专注之旅”确认弹窗。
        2. 系统提供专注与休息双状态切换，帮助用户在执行中保持节奏，而不是只做一个僵硬计时器。
        3. 任务完成后，不直接返回主页，而是进入剧情生成与奖励结算流程。
        4. 系统把这次真实努力写入剧情、短期记忆、世界实体，并在主线收束时生成章节终章。
        5. 阶段完成后还会形成赛季归档与永久称号，增强用户对长期成长的身份认同。

        ## （2）交互创新点

        本作品的交互创新，不在于发明新的手势，而在于重新组织“行为反馈”的层级：

        - **任务反馈叙事化：** 用户完成一次现实任务，获得的不只是数值和勾选，而是一个与角色、章节、世界状态一致的故事反馈。
        - **多层反馈同时成立：** 同一动作会同时触发进度条、奖励、剧情卡、记忆更新、章节推进等多层信息，让反馈既及时又有延续性。
        - **道具影响分支：** 商店购买的道具不是孤立收藏品，而会真实作用于副本剧情分支，提升系统内部的因果连贯性。
        - **休息也被设计进流程：** 专注与休息双态机制体现了“可持续自律”而非“高压打卡”的设计取向。

        # 大模型的具体应用说明（必须）

        本作品对大模型的应用并非停留在聊天层，而是嵌入到多个明确的业务节点：

        - **目标蓝图生成：** 根据用户目标、角色设定、周期与可投入时间，生成章节标题、主线摘要、开场叙事和 3 条可执行任务。
        - **任务完成叙事：** 在任务真正完成后，生成结构化剧情反馈，包括用户可见的 `story_text`、系统使用的 `memory_summary` 以及可沉淀的 `world_entities`。
        - **章节终章生成：** 当当前阶段主线全部完成时，系统会基于本阶段积累的记忆摘要生成章节大结局。
        - **赛季归档与称号提炼：** 在用户输入下一阶段目标前，系统会把上一季内容压缩为中期记忆，并提炼可长期保留的称号资产。
        - **轻量支线包装：** 用户临时新增的支线任务也会得到轻量叙事包装，保持整体世界观一致。

        值得强调的是，大模型在这里扮演的是“受约束的叙事与规划引擎”，而不是直接掌控业务状态的黑盒。

        # 详细创新点阐释（必须）

        ## 1. 解决方案创新

        作品把“效率工具”“角色成长”“剧情反馈”“长期记忆”“夜间副本”五件通常分散的事情，整合成一个闭环系统。用户不是在不同 App 之间切换任务、奖励和情绪补偿，而是在同一套世界观内持续推进。

        ## 2. 交互创新

        与普通任务产品的“输入任务 -> 完成任务 -> 勾选结束”不同，本作品把任务完成后最关键的一步重新设计成剧情卡与成长反馈，使行动后的感受被放大、被保存、被回顾。这会显著增强用户的持续动机。

        ## 3. 功能与性能创新

        作品并不把所有逻辑都交给模型处理，而是建立了更科学的职责分层：

        - 任务、奖励、技能、副本和登录恢复等核心状态由后端统一管理。
        - 大模型只在目标规划、叙事生成和归档提炼环节工作。
        - 叙事输出被限制为结构化 JSON，不满足要求时可降级到本地模板。
        - 系统会长期保留角色弧光、树状记忆、世界实体和赛季档案，避免“每次打开都像第一次聊天”。

        ## 4. 可靠性创新

        许多同类 AI 产品的最大问题是“有趣但不可靠”。本作品在可靠性上有四个关键设计：

        - **模型输出受约束：** 叙事生成要求返回固定字段，避免模型任意散写。
        - **关键状态不交给模型：** 成长值、资源点、任务状态、副本分支和用户快照由后端状态中心结算。
        - **失败可降级：** 即使没有 API Key 或模型调用失败，系统仍可使用本地蓝图和模板继续运行，不会整条链路中断。
        - **过程可审计：** 系统会同步生成角色身份档案与记忆档案，方便检查角色状态、记忆结构和阶段归档是否合理。

        ## 5. 系统设计的科学性

        本作品不是凭“脑洞”直接拼出来的，而是遵循了一条更科学的行为设计闭环：

        - **目标分解原则：** 把抽象目标拆成当下就能执行的最小任务，降低启动成本。
        - **即时反馈原则：** 每次完成立即获得剧情、奖励和进度推进，强化行动结果。
        - **阶段归档原则：** 通过章节终章、赛季纪要和永久称号，让用户看到长期积累而非零散打卡。
        - **身份认同原则：** 用户不是“做完一个清单”，而是在持续成为某种角色，这会增强长期坚持的内在动机。

        从产品方法论看，这是一套“降低启动门槛 -> 支持执行过程 -> 放大完成反馈 -> 引导下一阶段目标”的完整闭环，而不是单一功能点。

        \\newpage

        # 用户需求程度（必须）

        ## （1）目标用户画像

        本作品的核心目标用户主要包括以下两类：

        - **16-24 岁学生群体：** 备考四六级、考研、证书、编程课程，目标明确但执行容易中断。
        - **22-30 岁年轻职场人：** 下班后有技能提升需求，如英语、编程、资格考试、自我管理训练，但日常碎片化严重。

        这类人群共同特点是：目标长期、节奏容易被打断、需要持续反馈而不是一次性刺激。

        ## （2）核心痛点与需求

        作品主要解决以下问题：

        - 用户知道目标重要，但不知道今天最先做什么。
        - 用户即便完成任务，也很快失去成就感，难以坚持到下一次。
        - 用户需要的不只是“记录”，而是“被陪伴、被肯定、被持续推动”。

        这是一个**强需求、高频需求**。因为学习、自律、阶段性成长不是偶发场景，而是很多年轻人每天都在面对的现实问题。

        ## （3）典型应用场景

        **场景一：考试冲刺期**

        大学生在四六级或考研备考中，容易因为目标太大而拖延。系统会把“过六级”拆成当天就能执行的任务，并在每次完成后给出剧情激励和阶段推进，让用户更容易持续 30 天以上。

        **场景二：下班后技能提升**

        初入职场的年轻人希望系统学习编程或英语，但经常因为疲惫和碎片时间而中断。作品中的专注/休息双态、支线任务和夜间副本，能够把枯燥的训练节奏变成更容易维持的成长体验。

        ## （4）社会价值

        - 帮助年轻人建立更健康、更可持续的自律方式，而不是靠焦虑驱动。
        - 让 AI 不只是制造内容娱乐，而是服务于真实学习与长期成长。
        - 为教育、校园心理支持、青年技能提升场景提供更有温度的数字陪伴方案。
        - 将中文幻想叙事和成长记录结合，增强产品的文化表达力和记忆点。

        # 市场欢迎程度（必须）

        当前市场上已有不少效率、专注或游戏化产品，例如待办清单类、番茄钟类、轻 RPG 打卡类产品。它们各有优势，但普遍存在以下边界：

        - **传统待办工具**强在组织与记录，但情绪反馈弱，难以解决“知道该做，却不想开始”的问题。
        - **专注计时类产品**强在单次沉浸，但往往缺少长期目标链路、阶段总结和身份成长感。
        - **游戏化待办类产品**虽然更有趣，但很多奖励与真实努力之间缺乏深层绑定，长期叙事和世界状态往往不连续。

        与这些方案相比，《自律者联盟》的独特优势在于：

        | 维度 | 常见行业方案 | 自律者联盟 |
        | --- | --- | --- |
        | 目标拆解 | 多为人工录入或静态模板 | 结合角色设定、目标周期与投入时长生成可执行主线 |
        | 完成反馈 | 勾选、积分、番茄钟结束 | 剧情反馈 + 奖励结算 + 记忆沉淀 + 章节推进 |
        | 长期连续性 | 容易停留在单日效率 | 具备章节终章、赛季归档、永久称号和世界实体延续 |
        | 可玩性 | 游戏化常与真实任务弱绑定 | 道具、路线状态、副本结局与真实任务进度强关联 |
        | AI 可靠性 | 容易变成聊天或随机文案 | 结构化输出、状态中心结算、本地降级兜底 |
        | 可试用性 | 许多作品停留在概念 | 当前版本已具备注册、登录、状态恢复和连续体验能力 |

        因此，本作品的优势并不是“比别人更会讲故事”，而是“把故事、任务、记忆、成长和可持续试用做成了一个系统”。这也是它最不容易被简单抄袭的地方。别人可以模仿一个设定或文案风格，但很难在短时间内复刻整套状态结构、记忆机制和长期闭环。

        # 可靠性、科学性与可试用性补充说明

        为回应评审中常见的几个问题，本作品补充说明如下：

        ## 1. 如何保证 LLM 的可靠性？

        - 系统把大模型放在“叙事与规划层”，而不是放在“状态结算层”。
        - 输出格式被严格限制，减少不可控生成。
        - 没有模型或模型失败时，系统仍然可以继续工作。
        - 用户状态、任务状态、资源点和副本状态都有明确后端结构，不依赖模型自由发挥。

        ## 2. 作品独特性在哪里？

        真正独特的不是“学习 + 冒险故事”这个概念，而是概念背后的系统深度：角色人格层、动态弧光层、树状记忆层、世界实体层、副本状态机、赛季归档和账号恢复共同构成了持续成长体验。这使作品从一个“好玩 idea”升级为“可以长期运营和验证的产品原型”。

        ## 3. 设计是否科学？

        作品以目标分解、即时反馈、阶段归档和身份认同为核心设计原则，形成完整闭环；同时每次状态变化都由统一后端返回最新结果，前端不自行猜测状态，保证系统行为一致。

        ## 4. 产品是否可供用户连续试用？

        可以。当前版本已经具备账号注册、登录、状态快照恢复、任务推进、支线管理、商店兑换、夜间副本与长期记忆沉淀等能力，说明它不是停留在静态展示层的概念稿，而是具备连续试用条件的产品 Demo。后续可组织 7-14 天的小规模试用，以验证留存、完成率、连续打卡率与主观成就感提升情况。

        # 结语

        《自律者联盟》尝试回答一个很现实的问题：如果 AI 真正进入年轻人的学习与成长场景，它能否不只是“会聊天”，而是成为一个能把长期目标拆开、把每次努力记住、把坚持过程变得更值得继续的陪伴系统？本作品给出的答案是：可以，而且必须通过完整的产品机制来实现，而不是靠一句概念口号。
        """
    )


def main() -> None:
    write_svg("ui_setup.svg", figure_setup())
    write_svg("ui_home.svg", figure_home())
    write_svg("ui_dungeon.svg", figure_dungeon())
    write_svg("ui_dungeon_run.svg", figure_dungeon_run())
    write_svg("flow_onboarding.svg", figure_flow_onboarding())
    write_svg("flow_taskloop.svg", figure_flow_taskloop())

    MD_PATH.write_text(build_markdown(), encoding="utf-8")

    subprocess.run(
        [
            "pandoc",
            str(MD_PATH),
            "-o",
            str(DOCX_PATH),
            f"--resource-path={ROOT}",
        ],
        check=True,
    )

    print(f"Markdown: {MD_PATH}")
    print(f"Docx: {DOCX_PATH}")


if __name__ == "__main__":
    main()
