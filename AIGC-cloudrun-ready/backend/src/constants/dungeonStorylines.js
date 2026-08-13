const storylines = {
  scholar: {
    roleId: "scholar",
    lineName: "学者线 · 星辉书塔",
    chapterTitle: "月蚀书塔的失落回响",
    chapterIntro:
      "今夜的星辉书塔出现异常潮汐，封印中的古卷与观星仪正在互相呼应。你必须在失控的秘识洪流中做出抉择，决定这段禁忌知识究竟会成为照亮世界的火种，还是无人再敢触碰的静默封印。",
    maxScenes: 4,
    stateLabels: {
      insight: "秘识",
      bond: "共鸣",
      resolve: "定意",
    },
    startEventId: "scholar_e1",
    events: {
      scholar_e1: {
        title: "封印档案室的低语",
        description:
          "月蚀降临后，封印档案室的符文门忽然自行开启一道缝隙，失落手札的蓝银色墨痕正沿着地砖缓慢流动。守夜使魔提醒你：若不立刻处理，整层书架都会被古代回响唤醒。",
        choices: [
          {
            choiceId: "stabilize_barrier",
            label: "先稳固结界，再追索回响",
            nextEventId: "scholar_e2",
            effects: { resolve: 2, growth: 8, resources: 4 },
            flags: ["sealed-barrier"],
            outcome: "你以稳固术压下最外层回响，为后续探查争取到一线秩序。",
          },
          {
            choiceId: "follow_whispers",
            label: "循着低语直入深层书列",
            nextEventId: "scholar_e3",
            effects: { insight: 2, growth: 9, resources: 5 },
            flags: ["followed-whispers"],
            outcome: "你放任耳边的低语引路，踏进了只有失落学派才知晓的暗层书列。",
          },
          {
            choiceId: "call_familiar",
            label: "召来守夜使魔协助检视",
            nextEventId: "scholar_e4",
            effects: { bond: 2, growth: 7, resources: 6 },
            flags: ["trusted-familiar"],
            outcome: "使魔落在你肩头，以旧时代的守夜口令替你打开了另一条隐秘通道。",
          },
        ],
      },
      scholar_e2: {
        title: "静默书列的灰烬刻痕",
        description:
          "结界稳定后，你在最古老的一排石书之间发现一串尚未冷却的灰烬刻痕。那些刻痕像某种被强行抹去的名字，仍在尝试重组自身。",
        choices: [
          {
            choiceId: "trace_ashes",
            label: "沿刻痕逆推被抹除的真名",
            nextEventId: "scholar_e5",
            effects: { insight: 2, growth: 8, resources: 4 },
            flags: ["traced-true-name"],
            outcome: "你从灰烬深处辨认出一段残缺真名，书塔的禁制开始对你让步。",
          },
          {
            choiceId: "preserve_silence",
            label: "不触动真名，只记录刻痕纹路",
            nextEventId: "scholar_e6",
            effects: { resolve: 1, bond: 1, growth: 7, resources: 5 },
            flags: ["preserved-silence"],
            outcome: "你克制住窥探冲动，以抄录术保存下刻痕轨迹，避免惊醒更深层的警戒。",
          },
          {
            choiceId: "mark_with_sigil",
            label: "以词汇符印为刻痕重新命名",
            nextEventId: "scholar_e7",
            effects: { insight: 1, resolve: 1, growth: 8, resources: 6 },
            requiresInventory: ["sigil"],
            flags: ["sigil-renamed"],
            outcome: "符印在灰烬之上烙出新的注脚，你暂时压住了真名的反噬。",
          },
        ],
      },
      scholar_e3: {
        title: "观星穹顶的逆旋仪",
        description:
          "你沿着低语来到观星穹顶，发现逆旋仪正将群星轨迹倒转。仪心里悬着一枚裂开的水晶瞳孔，像在等待有人替它做出最后一次校准。",
        choices: [
          {
            choiceId: "decode_stars",
            label: "直接解读倒转星轨",
            nextEventId: "scholar_e6",
            effects: { insight: 2, growth: 9, resources: 4 },
            flags: ["decoded-stars"],
            outcome: "你强行读懂了逆旋星轨，从中摘下了一段无人敢记的未来片段。",
          },
          {
            choiceId: "share_load",
            label: "将星压分给守塔灵灯",
            nextEventId: "scholar_e7",
            effects: { bond: 2, growth: 7, resources: 6 },
            flags: ["shared-starlight"],
            outcome: "你让灵灯替你承受了一半星压，穹顶的回响变得不再敌视你。",
          },
          {
            choiceId: "hold_axis",
            label: "徒手稳住逆旋仪中轴",
            nextEventId: "scholar_e5",
            effects: { resolve: 2, growth: 8, resources: 5 },
            flags: ["held-axis"],
            outcome: "你以定意硬抗逆旋仪的轰鸣，换来片刻足以改写局势的静止。",
          },
        ],
      },
      scholar_e4: {
        title: "使魔巢笼中的旧誓页",
        description:
          "守夜使魔带你穿过侧塔巢笼，在一枚失温的龙骨灯下找到残缺誓页。誓页上记录着某位古代学者与书塔缔结的最后契约。",
        choices: [
          {
            choiceId: "read_oath",
            label: "当场诵读旧誓，唤醒塔灵",
            nextEventId: "scholar_e7",
            effects: { bond: 2, resolve: 1, growth: 8, resources: 5 },
            flags: ["read-old-oath"],
            outcome: "旧誓在你掌心复燃，沉睡的塔灵向你投来审视的一瞥。",
          },
          {
            choiceId: "keep_page",
            label: "收起誓页，暂不惊动任何灵体",
            nextEventId: "scholar_e5",
            effects: { resolve: 2, growth: 7, resources: 6 },
            flags: ["kept-oath-page"],
            outcome: "你将誓页纳入袖中，把书塔真正的反应留到了更关键的时刻。",
          },
          {
            choiceId: "ask_familiar",
            label: "让使魔解释誓页的主人",
            nextEventId: "scholar_e6",
            effects: { insight: 1, bond: 2, growth: 8, resources: 4 },
            flags: ["heard-familiar-secret"],
            outcome: "使魔说出了誓页主人的下落，那秘密让整段回响都拥有了名字。",
          },
        ],
      },
      scholar_e5: {
        title: "棱镜议厅的回声问答",
        description:
          "你来到棱镜议厅，十二面浮空镜正在轮流质询来者。每一面镜都映出不同版本的你，只有一个答案能让真正的门扉继续开启。",
        choices: [
          {
            choiceId: "answer_truth",
            label: "选择最危险、却最接近真相的回答",
            nextEventId: "scholar_e8",
            effects: { insight: 2, growth: 9, resources: 5 },
            flags: ["answered-truth"],
            outcome: "棱镜接纳了你的直视，议厅中央缓缓显出被遮蔽的主门纹路。",
          },
          {
            choiceId: "answer_balance",
            label: "以折中答案平息镜间争执",
            nextEventId: "scholar_e9",
            effects: { bond: 2, growth: 8, resources: 6 },
            flags: ["balanced-prisms"],
            outcome: "你让诸镜暂时达成一致，议厅不再撕扯同一段命运的多个版本。",
          },
          {
            choiceId: "answer_vow",
            label: "以个人誓言替代标准答案",
            nextEventId: "scholar_e10",
            effects: { resolve: 2, growth: 8, resources: 4 },
            flags: ["answered-with-vow"],
            outcome: "诸镜没有得到预设答案，却为你的誓言留出了一条足以通过的狭缝。",
          },
        ],
      },
      scholar_e6: {
        title: "墨海回廊的失序浪潮",
        description:
          "整条回廊被黑蓝色墨潮倒灌，浮动的文字时而像海兽，时而像沉没的碑文。你必须决定，是驾驭这些文字，还是让它们重新归于无名。",
        choices: [
          {
            choiceId: "name_tide",
            label: "为墨潮中的文字一一定名",
            nextEventId: "scholar_e8",
            effects: { insight: 2, resolve: 1, growth: 9, resources: 4 },
            flags: ["named-ink-tide"],
            outcome: "你以命名术把失序潮汐重新编织成可以阅读的河流。",
          },
          {
            choiceId: "guide_tide",
            label: "引导墨潮绕开书塔中轴",
            nextEventId: "scholar_e9",
            effects: { bond: 1, resolve: 1, growth: 7, resources: 7 },
            flags: ["guided-ink-tide"],
            outcome: "你没有强行驯服墨潮，而是替它找到了不再伤人的流向。",
          },
          {
            choiceId: "seal_tide",
            label: "以静默术将整段浪潮冻结",
            nextEventId: "scholar_e10",
            effects: { resolve: 2, growth: 8, resources: 5 },
            flags: ["sealed-ink-tide"],
            outcome: "整片墨海在你面前化作一面寂静黑镜，所有未出口的名字都被封在镜内。",
          },
        ],
      },
      scholar_e7: {
        title: "龙骨灯塔的遗失校注",
        description:
          "侧塔尽头的龙骨灯塔中，悬着一册从未进入馆藏的校注集。页边批语出自不同年代，却都在指向同一个被抹去的术式源头。",
        choices: [
          {
            choiceId: "restore_annotations",
            label: "补全所有校注，追出完整源头",
            nextEventId: "scholar_e8",
            effects: { insight: 2, bond: 1, growth: 9, resources: 5 },
            flags: ["restored-annotations"],
            outcome: "你用不同年代的笔迹拼出真正的源头，灯塔的光焰第一次稳定下来。",
          },
          {
            choiceId: "share_credit",
            label: "将校注功绩归还给历代守塔者",
            nextEventId: "scholar_e9",
            effects: { bond: 2, growth: 8, resources: 6 },
            flags: ["shared-credit"],
            outcome: "你没有独占这份发现，整座灯塔因此对你敞开了更深的权限。",
          },
          {
            choiceId: "burn_copy",
            label: "只保留真本，焚去危险抄件",
            nextEventId: "scholar_e10",
            effects: { resolve: 2, growth: 8, resources: 4 },
            flags: ["burned-copy"],
            outcome: "火焰吞没了最危险的抄件，只留下真正值得继续守护的那一册。",
          },
        ],
      },
      scholar_e8: {
        title: "黎明藏卷的开启刻",
        description:
          "你抵达书塔最深处，黎明藏卷正悬浮在星辉与灰烬之间。它要求来者决定：知识是否应被完整公开，哪怕会打碎所有旧秩序。",
        choices: [
          {
            choiceId: "open_dawn_volume",
            label: "开启藏卷，让真相照亮整座书塔",
            nextEventId: "ending_scholar_truth",
            effects: { insight: 1, growth: 10, resources: 6 },
            flags: ["opened-dawn-volume"],
            outcome: "你选择让真相被看见，哪怕代价是无人还能回到旧日的安宁。",
          },
          {
            choiceId: "invite_witnesses",
            label: "召来塔灵共同见证藏卷开启",
            nextEventId: "ending_scholar_concord",
            effects: { bond: 1, growth: 9, resources: 7 },
            flags: ["invited-witnesses"],
            outcome: "你拒绝独自持有黎明，把开启的权力交回给所有仍守望此塔的灵体。",
          },
        ],
      },
      scholar_e9: {
        title: "星辉誓环的回归议定",
        description:
          "棱镜、灯塔与档案室的力量在你脚下汇成誓环。只要你点头，书塔便会重新认定今夜的秩序归属，问题只在于你愿意留下多少个人痕迹。",
        choices: [
          {
            choiceId: "crown_with_peace",
            label: "以共享誓约重建书塔秩序",
            nextEventId: "ending_scholar_concord",
            effects: { bond: 1, resolve: 1, growth: 9, resources: 6 },
            flags: ["rebuilt-with-oath"],
            outcome: "你让誓环重新围绕众人闭合，今夜的知识不再只属于某一个名字。",
          },
          {
            choiceId: "step_back",
            label: "退后一步，让秩序自行闭合",
            nextEventId: "ending_scholar_silence",
            effects: { resolve: 1, growth: 8, resources: 7 },
            flags: ["stepped-back"],
            outcome: "你拒绝在誓环中央留下自己的影子，把最深的权柄重新交还给静默。",
          },
        ],
      },
      scholar_e10: {
        title: "静默封印的最后空页",
        description:
          "最后一页空白正等待新的书写。你已经知道足够多，也足够接近真相，但真正困难的是决定：有些知识究竟该被守住，还是该被再次唤醒。",
        choices: [
          {
            choiceId: "seal_forever",
            label: "将真相封回空页，不再唤醒它",
            nextEventId: "ending_scholar_silence",
            effects: { resolve: 2, growth: 9, resources: 6 },
            flags: ["sealed-forever"],
            outcome: "你用自己的名字完成封印，空白重新沉入无人能轻易触碰的深层。",
          },
          {
            choiceId: "leave_clue",
            label: "只留一段线索，等待后来者",
            nextEventId: "ending_scholar_truth",
            effects: { insight: 1, bond: 1, growth: 9, resources: 5 },
            flags: ["left-clue"],
            outcome: "你没有彻底抹去真相，只为未来的某位来者留下了能追索到这里的第一步。",
          },
        ],
      },
    },
    endings: {
      ending_scholar_truth: {
        direction: "真知破晓",
        title: "结局 · 黎明藏卷已开",
        storyText:
          "你让书塔最深处的真相重见天日。失落学派的名字、被抹除的术式与长久以来的静默禁令一同被揭开，整座星辉书塔在黎明前完成了一次无法逆转的重写。",
        rewardSummary: "结局奖励：成长值 +16，资源点 +10",
        rewardDelta: { growth: 16, resources: 10 },
      },
      ending_scholar_concord: {
        direction: "群星共誓",
        title: "结局 · 诸灵与书塔同盟",
        storyText:
          "你没有独占任何一段秘密，而是把今夜的一切重新织回众人的誓约。塔灵、使魔与仍在守望的无名学者一同回应你的选择，书塔因此迎来了新的秩序。",
        rewardSummary: "结局奖励：成长值 +14，资源点 +12",
        rewardDelta: { growth: 14, resources: 12 },
      },
      ending_scholar_silence: {
        direction: "静默守藏",
        title: "结局 · 空页归于封印",
        storyText:
          "你把足以扰乱时代的秘密重新封回空白，让书塔继续以沉默的方式守护世界。没有欢呼，也没有宣告，只有一页写着你名字的隐秘封签被压进最深的层架。",
        rewardSummary: "结局奖励：成长值 +18，资源点 +8",
        rewardDelta: { growth: 18, resources: 8 },
      },
    },
  },
  knight: {
    roleId: "knight",
    lineName: "骑士线 · 誓焰边境",
    chapterTitle: "灰烬关口的誓约回声",
    chapterIntro:
      "夜雾压向边境，灰烬关口的誓焰纹阵接连失控。你必须在溃散的誓约、受困的同袍和逼近的夜兽之间做出选择，决定今夜的王庭究竟会记住一位守护者，还是一位破阵者。",
    maxScenes: 4,
    stateLabels: {
      insight: "战识",
      bond: "守誓",
      resolve: "锋决",
    },
    startEventId: "knight_e1",
    events: {
      knight_e1: {
        title: "灰烬关口的断桥火纹",
        description:
          "巡夜钟声尚未停歇，灰烬关口的断桥就被火纹一寸寸点亮。桥彼端还有三名见习骑士被困，而更深处的誓焰核心正在失衡。",
        choices: [
          {
            choiceId: "escort_squires",
            label: "先护送见习骑士撤离",
            nextEventId: "knight_e2",
            effects: { bond: 2, growth: 8, resources: 5 },
            flags: ["rescued-squires"],
            outcome: "你先稳住最脆弱的阵线，见习骑士们在你的掩护下退回了安全界碑。",
          },
          {
            choiceId: "rush_core",
            label: "直接冲向誓焰核心",
            nextEventId: "knight_e3",
            effects: { resolve: 2, growth: 9, resources: 4 },
            flags: ["rushed-core"],
            outcome: "你顶着灼热纹浪突入桥心，誓焰的轰鸣沿剑柄一路传到胸腔。",
          },
          {
            choiceId: "read_pattern",
            label: "停步判断火纹失衡规律",
            nextEventId: "knight_e4",
            effects: { insight: 2, growth: 7, resources: 6 },
            flags: ["read-fire-pattern"],
            outcome: "你没有急于拔剑，而是先在火纹中看出下一次崩裂的轨迹。",
          },
        ],
      },
      knight_e2: {
        title: "誓旗风口的旧军号",
        description:
          "护送途中，你在誓旗风口听见了早已停用的旧军号。那号声在劝你回头，仿佛还有一支早被判为阵亡的队伍正在关口另一侧等待支援。",
        choices: [
          {
            choiceId: "answer_horn",
            label: "回应旧军号，寻找失踪旧部",
            nextEventId: "knight_e5",
            effects: { bond: 2, growth: 8, resources: 4 },
            flags: ["answered-old-horn"],
            outcome: "你让号声重新在风口回荡，尘封多年的誓旗第一次有了回应。",
          },
          {
            choiceId: "hold_line",
            label: "无视号声，先守住当前退路",
            nextEventId: "knight_e6",
            effects: { resolve: 2, growth: 8, resources: 5 },
            flags: ["held-retreat-line"],
            outcome: "你压住追索冲动，把所有注意力都留给眼前尚未稳住的退路。",
          },
          {
            choiceId: "trace_echo",
            label: "循着回声判断军号真假",
            nextEventId: "knight_e7",
            effects: { insight: 2, growth: 7, resources: 6 },
            flags: ["traced-horn-echo"],
            outcome: "你听出军号里夹杂的魔雾杂音，判断这不是普通的召援，而是一场试探。",
          },
        ],
      },
      knight_e3: {
        title: "裂甲回廊的誓焰试锋",
        description:
          "通往核心的裂甲回廊中遍布被烧红的断刃和碎盾。每一道地面裂缝都在回放过去的败北瞬间，逼你决定是凭武力破开前路，还是借旧败寻找突破。",
        choices: [
          {
            choiceId: "break_forward",
            label: "以正面冲锋撕开回廊",
            nextEventId: "knight_e6",
            effects: { resolve: 2, growth: 9, resources: 4 },
            flags: ["broke-forward"],
            outcome: "你让回廊在正面斩击下分出一道可通行的狭缝，火纹却因此更加躁动。",
          },
          {
            choiceId: "salute_fallen",
            label: "向旧败之影致意，借其轨迹前行",
            nextEventId: "knight_e5",
            effects: { bond: 1, insight: 1, growth: 8, resources: 5 },
            flags: ["saluted-fallen"],
            outcome: "你承认旧败留下的教训，那些倒下的影像便不再阻拦你的脚步。",
          },
          {
            choiceId: "cloak_charge",
            label: "披上专注披风，压低誓焰反噬",
            nextEventId: "knight_e7",
            effects: { resolve: 1, bond: 1, growth: 8, resources: 6 },
            requiresInventory: ["cloak"],
            flags: ["cloak-charge"],
            outcome: "披风吸收了最先爆开的火纹，让你在几乎不受灼伤的情况下穿过回廊。",
          },
        ],
      },
      knight_e4: {
        title: "雾堡瞭望台的夜兽前兆",
        description:
          "你在瞭望台上看见夜兽潮的前锋正沿雾线试探边境结界。它们尚未真正进攻，却在等待关口内部先一步崩坏。",
        choices: [
          {
            choiceId: "warn_fort",
            label: "立刻向雾堡发出预警",
            nextEventId: "knight_e7",
            effects: { bond: 2, growth: 7, resources: 7 },
            flags: ["warned-fort"],
            outcome: "你的预警让雾堡提前点亮外圈信标，边境终于有了可以依托的后手。",
          },
          {
            choiceId: "ambush_scouts",
            label: "先截断夜兽斥候的探路线",
            nextEventId: "knight_e5",
            effects: { insight: 1, resolve: 1, growth: 8, resources: 5 },
            flags: ["cut-scout-line"],
            outcome: "你让斥候队消失在雾里，夜兽的主潮因此迟疑了整整一轮月息。",
          },
          {
            choiceId: "bait_into_fire",
            label: "引它们踏入失控火纹范围",
            nextEventId: "knight_e6",
            effects: { insight: 2, growth: 9, resources: 4 },
            flags: ["baited-nightbeasts"],
            outcome: "你把夜兽引向最危险的火纹地带，让敌人与失控誓焰彼此消耗。",
          },
        ],
      },
      knight_e5: {
        title: "焰心门廊的双重誓约",
        description:
          "焰心门廊前悬着两道誓约残卷：一道写着守人，一道写着守关。任何一卷被重新点燃，另一卷都会暂时沉寂。",
        choices: [
          {
            choiceId: "guard_people",
            label: "优先点燃守人誓约",
            nextEventId: "knight_e8",
            effects: { bond: 2, growth: 8, resources: 6 },
            flags: ["lit-people-oath"],
            outcome: "守人誓约在空中燃成金色弧线，所有你曾护下的人都成了誓焰的一部分。",
          },
          {
            choiceId: "guard_gate",
            label: "优先点燃守关誓约",
            nextEventId: "knight_e9",
            effects: { resolve: 2, growth: 9, resources: 5 },
            flags: ["lit-gate-oath"],
            outcome: "整座关口的石壁同时回应你的抉择，像是愿把自身重量全部交给你承担。",
          },
          {
            choiceId: "read_both",
            label: "先读尽两卷誓文，再决定主次",
            nextEventId: "knight_e10",
            effects: { insight: 2, growth: 8, resources: 5 },
            flags: ["read-both-oaths"],
            outcome: "你没有急于点燃任何一卷，而是先辨清了誓约真正分裂的起点。",
          },
        ],
      },
      knight_e6: {
        title: "断刃祭坛的回火纹阵",
        description:
          "断刃祭坛上的回火纹阵正在吸收每一把曾在此折断的兵刃。只要你愿意献出自己的佩剑，它就会在一瞬间平息，但此后你必须空手面对最后的夜潮。",
        choices: [
          {
            choiceId: "offer_blade",
            label: "献出佩剑，换取纹阵平息",
            nextEventId: "knight_e9",
            effects: { resolve: 2, bond: 1, growth: 8, resources: 6 },
            flags: ["offered-blade"],
            outcome: "你的佩剑化作祭坛中最明亮的一道火线，纹阵终于停止吞噬周边的护墙。",
          },
          {
            choiceId: "refuse_offer",
            label: "保留佩剑，强行压制回火",
            nextEventId: "knight_e8",
            effects: { resolve: 2, growth: 9, resources: 4 },
            flags: ["refused-offer"],
            outcome: "你没有交出佩剑，而是用更暴烈的方式把回火按回地缝之下。",
          },
          {
            choiceId: "trace_blades",
            label: "从断刃共鸣里找出祭坛源头",
            nextEventId: "knight_e10",
            effects: { insight: 2, growth: 8, resources: 5 },
            flags: ["traced-broken-blades"],
            outcome: "你听见每一把断刃留下的最后一句誓词，从中找到了真正令纹阵失衡的旧伤。",
          },
        ],
      },
      knight_e7: {
        title: "边境誓灯的余烬之问",
        description:
          "边境誓灯本应只照亮来犯者，如今却把关内所有骑士的影子都映得支离破碎。它在问你：若只能保全一样东西，你会保全誓言，还是保全留下誓言的人。",
        choices: [
          {
            choiceId: "save_vowbearers",
            label: "保全仍在持誓的人",
            nextEventId: "knight_e8",
            effects: { bond: 2, growth: 8, resources: 6 },
            flags: ["saved-vowbearers"],
            outcome: "誓灯因为你的回答变得柔和，照在每个仍然站立的人身上。",
          },
          {
            choiceId: "save_oath",
            label: "保全誓言本身的延续",
            nextEventId: "knight_e9",
            effects: { resolve: 2, growth: 9, resources: 5 },
            flags: ["saved-oath"],
            outcome: "你让誓灯重新回到最初的严厉，仿佛宁肯牺牲姓名，也不肯让边境的誓文断代。",
          },
          {
            choiceId: "understand_loss",
            label: "追问誓灯为何开始映碎影子",
            nextEventId: "knight_e10",
            effects: { insight: 2, growth: 8, resources: 5 },
            flags: ["understood-loss"],
            outcome: "你从碎影中看见了誓灯最初熄灭的那一夜，终于明白它真正惧怕的不是敌袭。",
          },
        ],
      },
      knight_e8: {
        title: "晨誓广庭的归队号令",
        description:
          "你走进晨誓广庭，失散的旧部、受困的学徒和边堡信使都在等待同一声号令。只要你抬手，他们就会按照你的选择组成今夜最后一次守线阵列。",
        choices: [
          {
            choiceId: "call_full_line",
            label: "集结众人，共守晨誓阵列",
            nextEventId: "ending_knight_guardian",
            effects: { bond: 1, growth: 10, resources: 6 },
            flags: ["called-full-line"],
            outcome: "你举起号旗，所有还愿意守线的人都在晨誓广庭重新列阵。",
          },
          {
            choiceId: "lead_front",
            label: "自己站上最前线，为众人开路",
            nextEventId: "ending_knight_vanguard",
            effects: { resolve: 1, growth: 11, resources: 5 },
            flags: ["led-the-front"],
            outcome: "你把最危险的位置留给自己，整条阵线因此有了向前推进的勇气。",
          },
        ],
      },
      knight_e9: {
        title: "无火王徽的交付时刻",
        description:
          "誓焰核心终于安静下来，但王庭旧徽仍悬在半空，没有火，也没有纹。它只认得今夜真正承担了边境重量的人，并要求你给出最后的交付方式。",
        choices: [
          {
            choiceId: "wear_crest",
            label: "亲自佩戴王徽，继续守在边境",
            nextEventId: "ending_knight_vanguard",
            effects: { resolve: 2, growth: 10, resources: 5 },
            flags: ["wore-crest"],
            outcome: "你接过了没有火焰的王徽，把自己变成边境新的誓焰载体。",
          },
          {
            choiceId: "share_crest",
            label: "将王徽分赐给仍在守线的人",
            nextEventId: "ending_knight_guardian",
            effects: { bond: 1, resolve: 1, growth: 9, resources: 7 },
            flags: ["shared-crest"],
            outcome: "你没有让王徽属于某一个人，而是让它变成整条边境共同承受的责任。",
          },
        ],
      },
      knight_e10: {
        title: "誓焰余烬中的无名墓碑",
        description:
          "最深处立着一块无名墓碑，碑前插着当年守线者留下的断枪。碑文没有写死亡，只写着一句尚未完成的托付：替我们把灯留到下一场天明。",
        choices: [
          {
            choiceId: "keep_watch",
            label: "接下无名托付，继续守灯",
            nextEventId: "ending_knight_watch",
            effects: { insight: 1, bond: 1, growth: 10, resources: 6 },
            flags: ["accepted-watch"],
            outcome: "你听见墓碑后风声翻涌，那些未归队的名字像终于等到了新的答复。",
          },
          {
            choiceId: "raise_lamp",
            label: "将断枪熔成新的誓灯支架",
            nextEventId: "ending_knight_watch",
            effects: { resolve: 1, insight: 1, growth: 9, resources: 7 },
            flags: ["raised-new-lamp"],
            outcome: "你用断枪重铸誓灯，把旧败化成了能照到更远地方的火。",
          },
        ],
      },
    },
    endings: {
      ending_knight_guardian: {
        direction: "守线同盟",
        title: "结局 · 晨誓阵列重燃",
        storyText:
          "你让边境重新拥有了彼此托付的力量。无论是见习骑士、旧部还是信使，都在你的号令下重新站进晨誓阵列，灰烬关口第一次不再靠一人强撑整夜。",
        rewardSummary: "结局奖励：成长值 +14，资源点 +12",
        rewardDelta: { growth: 14, resources: 12 },
      },
      ending_knight_vanguard: {
        direction: "破阵先锋",
        title: "结局 · 王徽与锋火同归",
        storyText:
          "你把自己化作新的锋火，顶在所有人之前。关口仍旧危险，边境依然漫长，但今夜之后，所有人都知道最先踏进夜潮的人是你。",
        rewardSummary: "结局奖励：成长值 +18，资源点 +8",
        rewardDelta: { growth: 18, resources: 8 },
      },
      ending_knight_watch: {
        direction: "无烬守灯",
        title: "结局 · 无名者的火继续亮着",
        storyText:
          "你没有为今夜留下夸耀的凯歌，而是接过了那些无名守线者未完成的托付。边境最深处的那盏灯因此没有熄灭，它会记得你曾让它再一次照到天明。",
        rewardSummary: "结局奖励：成长值 +16，资源点 +10",
        rewardDelta: { growth: 16, resources: 10 },
      },
    },
  },
  traveler: {
    roleId: "traveler",
    lineName: "旅者线 · 月影迷途",
    chapterTitle: "雾海集市的裂月秘路",
    chapterIntro:
      "月升之后，雾海峡谷中只会出现一晚的月影集市再度开启。星盘碎片、旧契约、失路者的传闻和会消失的秘门全都指向同一条裂月秘路，而你只能带走其中的一部分真相。",
    maxScenes: 4,
    stateLabels: {
      insight: "星感",
      bond: "机缘",
      resolve: "行意",
    },
    startEventId: "traveler_e1",
    events: {
      traveler_e1: {
        title: "月影集市的旋灯入口",
        description:
          "雾海峡谷的石阶一节节亮起，月影集市在你面前显形。戴狐面的商贩、披沙纱的占星者和会开口说话的风铃都在同时向你发出邀请。",
        choices: [
          {
            choiceId: "follow_merchant",
            label: "先听狐面商贩的交易提议",
            nextEventId: "traveler_e2",
            effects: { bond: 2, growth: 8, resources: 6 },
            flags: ["trusted-merchant"],
            outcome: "狐面商贩递给你一枚会自行转动的星盘碎片，像是在预告一条专属于你的路。",
          },
          {
            choiceId: "ask_astrologer",
            label: "先向占星者询问月路走向",
            nextEventId: "traveler_e3",
            effects: { insight: 2, growth: 8, resources: 5 },
            flags: ["consulted-astrologer"],
            outcome: "占星者没有直接回答，只在你掌心画下了一条会在风里移动的银线。",
          },
          {
            choiceId: "walk_gap",
            label: "绕开喧闹，沿裂月石缝自行探路",
            nextEventId: "traveler_e4",
            effects: { resolve: 2, growth: 9, resources: 4 },
            flags: ["walked-alone"],
            outcome: "你离开集市主路，独自踏进月光切开的石缝，像回到每一次真正启程之前。",
          },
        ],
      },
      traveler_e2: {
        title: "星盘摊位的旧契约",
        description:
          "狐面商贩把你带到最深处的星盘摊位。摊上摆着一枚裂开的航盘核心，而它的底座赫然刻着另一位旅者尚未履行完毕的旧契约。",
        choices: [
          {
            choiceId: "buy_fragment",
            label: "接受交易，先拿下星盘核心",
            nextEventId: "traveler_e5",
            effects: { bond: 2, growth: 8, resources: 5 },
            flags: ["bought-fragment"],
            outcome: "你用一枚夜砂币换来了核心碎片，也把那份旧契约的一角压进了自己的旅袋。",
          },
          {
            choiceId: "inspect_contract",
            label: "先解读旧契约的来历",
            nextEventId: "traveler_e6",
            effects: { insight: 2, growth: 8, resources: 4 },
            flags: ["inspected-contract"],
            outcome: "你从旧契约的反光中看见一位失路旅者的最后踪迹，交易的代价忽然清晰起来。",
          },
          {
            choiceId: "leave_token",
            label: "留下信物，约定稍后再来",
            nextEventId: "traveler_e7",
            effects: { resolve: 1, bond: 1, growth: 7, resources: 7 },
            flags: ["left-token"],
            outcome: "你没有立刻成交，而是留下自己的旅行徽记，让这笔交易暂时停在悬而未决的月影里。",
          },
        ],
      },
      traveler_e3: {
        title: "雾幕星桥的偏移刻度",
        description:
          "占星者领你来到雾幕星桥前，桥面的刻度正在缓慢偏移。她说，今晚只有一条路会真正通向秘门，其余道路都只会带你走回自己的旧影。",
        choices: [
          {
            choiceId: "read_bridge",
            label: "亲自校准星桥刻度",
            nextEventId: "traveler_e6",
            effects: { insight: 2, growth: 9, resources: 4 },
            flags: ["calibrated-bridge"],
            outcome: "你在桥面碎星中找到了真正的北向，整座星桥于是为你微微偏转。",
          },
          {
            choiceId: "trust_guide",
            label: "相信占星者的指引直接过桥",
            nextEventId: "traveler_e7",
            effects: { bond: 2, growth: 7, resources: 7 },
            flags: ["trusted-guide"],
            outcome: "你没有再多看一眼脚下刻度，而是把方向暂时交给了另一双眼睛。",
          },
          {
            choiceId: "jump_rail",
            label: "越过安全轨，走桥外月栏",
            nextEventId: "traveler_e5",
            effects: { resolve: 2, growth: 9, resources: 5 },
            flags: ["jumped-rail"],
            outcome: "你踩着桥外月栏飞掠而过，把所有被警告的风险都甩在了身后。",
          },
        ],
      },
      traveler_e4: {
        title: "裂月石缝中的回身脚印",
        description:
          "你在石缝深处发现了一串会自行回头的脚印。每一步都在提示你：若继续往前，你将失去一段曾经能让你回头的安全路线。",
        choices: [
          {
            choiceId: "erase_steps",
            label: "抹去脚印，彻底切断退路",
            nextEventId: "traveler_e7",
            effects: { resolve: 2, growth: 9, resources: 4 },
            flags: ["erased-steps"],
            outcome: "你亲手抹平了最后能回头的痕迹，于是整条石缝都认可了你的决绝。",
          },
          {
            choiceId: "read_steps",
            label: "沿脚印反查前任旅者去向",
            nextEventId: "traveler_e6",
            effects: { insight: 2, growth: 8, resources: 5 },
            flags: ["read-steps"],
            outcome: "你从回身脚印里看见了另一位旅者当年的迟疑，也看到她后来没能抵达的终点。",
          },
          {
            choiceId: "leave_mark",
            label: "用符印留下自己的返程标记",
            nextEventId: "traveler_e5",
            effects: { bond: 1, resolve: 1, growth: 8, resources: 6 },
            requiresInventory: ["sigil"],
            flags: ["left-return-mark"],
            outcome: "你在石壁上留下了一枚返程标记，让迷路不再意味着彻底失联。",
          },
        ],
      },
      traveler_e5: {
        title: "流沙驿站的交换灯",
        description:
          "流沙驿站里悬着一盏会记录过路者愿望的交换灯。它承诺可以给你一条更快的秘路，但要求你先交出一段不再使用的旧愿望。",
        choices: [
          {
            choiceId: "trade_old_wish",
            label: "交出旧愿望，换取捷径",
            nextEventId: "traveler_e8",
            effects: { resolve: 1, bond: 1, growth: 8, resources: 6 },
            flags: ["traded-old-wish"],
            outcome: "交换灯吞下你口中的旧愿望，灯焰随即指向了一条此前不可见的岔路。",
          },
          {
            choiceId: "question_lamp",
            label: "先问清交换灯真正收走了什么",
            nextEventId: "traveler_e9",
            effects: { insight: 2, growth: 8, resources: 5 },
            flags: ["questioned-lamp"],
            outcome: "你没有急着交换，而是听见灯焰里藏着的诸多前人低语。",
          },
          {
            choiceId: "share_fire",
            label: "把灯焰分给迷路者同行",
            nextEventId: "traveler_e10",
            effects: { bond: 2, growth: 7, resources: 7 },
            flags: ["shared-lampfire"],
            outcome: "你把更快的路分给了别人，驿站却因此向你打开了另一扇不写在图上的门。",
          },
        ],
      },
      traveler_e6: {
        title: "旧航图墓场的沉星碑",
        description:
          "这里堆满作废的航图与沉入雾海的星标，中央立着一块沉星碑。碑面每闪一次光，就会映出一条曾被证明走不通的路线。",
        choices: [
          {
            choiceId: "salvage_route",
            label: "从作废航图里拼回一条新路",
            nextEventId: "traveler_e8",
            effects: { insight: 2, growth: 9, resources: 4 },
            flags: ["salvaged-route"],
            outcome: "你把无数被判失败的路线重新拼接，结果竟得到一条从未被记录的通路。",
          },
          {
            choiceId: "honor_lost",
            label: "向失路者献灯，换取指引",
            nextEventId: "traveler_e9",
            effects: { bond: 2, growth: 8, resources: 5 },
            flags: ["honored-lost"],
            outcome: "沉星碑上的光不再冰冷，那些迷失在雾海中的名字开始替你指路。",
          },
          {
            choiceId: "walk_unmarked",
            label: "拒绝旧图，走向无标记之地",
            nextEventId: "traveler_e10",
            effects: { resolve: 2, growth: 8, resources: 6 },
            flags: ["walked-unmarked"],
            outcome: "你放弃所有旧航图，像真正的旅者那样把第一步交给自己。",
          },
        ],
      },
      traveler_e7: {
        title: "狐面长廊的借名交易",
        description:
          "穿过长廊时，狐面商贩再次拦住你，提出一笔更危险的交易：若你愿意借走一个并不属于自己的名字，就能短暂打开更高阶的秘门。",
        choices: [
          {
            choiceId: "borrow_name",
            label: "借名入门，先到达再说",
            nextEventId: "traveler_e10",
            effects: { resolve: 2, growth: 9, resources: 4 },
            flags: ["borrowed-name"],
            outcome: "你带着暂借来的名字穿过长廊，门后的风景因此对你短暂让步。",
          },
          {
            choiceId: "decline_name",
            label: "拒绝借名，坚持以本名启门",
            nextEventId: "traveler_e8",
            effects: { insight: 1, resolve: 1, growth: 8, resources: 5 },
            flags: ["kept-own-name"],
            outcome: "你拒绝更快的路，长廊尽头那道门于是以更缓慢、却更真实的方式回应了你。",
          },
          {
            choiceId: "ask_price",
            label: "追问借名交易最终代价",
            nextEventId: "traveler_e9",
            effects: { insight: 1, bond: 1, growth: 8, resources: 6 },
            flags: ["asked-name-price"],
            outcome: "你从商贩含笑不语的停顿里，听出了这笔交易为何至今没有写进公开契约。",
          },
        ],
      },
      traveler_e8: {
        title: "裂月秘门的第一转轴",
        description:
          "你来到裂月秘门前，门环由无数碎裂的月相拼成。只要旋动第一转轴，秘门就会真正认定你今夜选择的方向。",
        choices: [
          {
            choiceId: "open_homeward",
            label: "让秘门指向归航与真图",
            nextEventId: "ending_traveler_homeward",
            effects: { insight: 1, growth: 10, resources: 6 },
            flags: ["opened-homeward-gate"],
            outcome: "你让秘门记住了可以带人平安归去的方向，雾海第一次显出完整航线。",
          },
          {
            choiceId: "open_tradewind",
            label: "让秘门指向新的同行契约",
            nextEventId: "ending_traveler_alliance",
            effects: { bond: 1, growth: 9, resources: 7 },
            flags: ["opened-tradewind-gate"],
            outcome: "门后的风吹来远方商队与流浪者的呼声，像在邀请你走向更宽广的相遇。",
          },
        ],
      },
      traveler_e9: {
        title: "雾海灯塔的潮汐誓文",
        description:
          "秘门旁侧的雾海灯塔写满潮汐誓文。灯塔愿意替你标记未来的旅路，但前提是你必须承认：任何标记都意味着放弃另一种自由。",
        choices: [
          {
            choiceId: "light_for_many",
            label: "点亮灯塔，为后来者留路",
            nextEventId: "ending_traveler_alliance",
            effects: { bond: 2, growth: 9, resources: 6 },
            flags: ["lit-lighthouse"],
            outcome: "你选择让更多后来者看见路，灯塔因此把你的名字并入了潮汐誓文。",
          },
          {
            choiceId: "keep_drift",
            label: "保留漂泊权，不为任何航线停步",
            nextEventId: "ending_traveler_wild",
            effects: { resolve: 2, growth: 10, resources: 5 },
            flags: ["kept-drift"],
            outcome: "你没有把自己钉在任何一盏灯下，而是继续把世界当成尚未画完的地图。",
          },
        ],
      },
      traveler_e10: {
        title: "无标星原的最后回望",
        description:
          "最后一片无标星原安静得像不存在。只有你自己知道，穿过这里后，今夜的旅路就不再只是一次短暂试探，而会成为真正改变未来方向的决定。",
        choices: [
          {
            choiceId: "walk_farther",
            label: "继续向无人记录的远处走去",
            nextEventId: "ending_traveler_wild",
            effects: { resolve: 2, growth: 10, resources: 5 },
            flags: ["walked-farther"],
            outcome: "你没有回望，任由最后一块可辨认的路标消失在身后。",
          },
          {
            choiceId: "chart_return",
            label: "回身绘下能带人归来的星图",
            nextEventId: "ending_traveler_homeward",
            effects: { insight: 2, growth: 9, resources: 6 },
            flags: ["charted-return"],
            outcome: "你在无标星原上停下，把一路走来的迷途改写成了真正可被跟随的航图。",
          },
        ],
      },
    },
    endings: {
      ending_traveler_homeward: {
        direction: "归航真图",
        title: "结局 · 裂月航图完成",
        storyText:
          "你把今夜所有碎裂的线索汇成了一张真正能指路的航图。月影集市不会永远存在，但你留下的归航路径，会让后来者不必再把每次远行都赌成一场迷失。",
        rewardSummary: "结局奖励：成长值 +16，资源点 +10",
        rewardDelta: { growth: 16, resources: 10 },
      },
      ending_traveler_alliance: {
        direction: "雾海新盟",
        title: "结局 · 集市与旅路结成新约",
        storyText:
          "你没有把秘门变成只属于自己的捷径，而是让更多同行者能从今夜开始共享新的通路。狐面商贩、占星者与无数失路者的名字因此第一次被织进同一张旅契。",
        rewardSummary: "结局奖励：成长值 +14，资源点 +12",
        rewardDelta: { growth: 14, resources: 12 },
      },
      ending_traveler_wild: {
        direction: "月下独行",
        title: "结局 · 无标之路仍在前方",
        storyText:
          "你拒绝把自己固定在任何一张地图里。今夜过后，裂月秘路依旧会在雾海深处时隐时现，而你会继续走向那些还没有名字、也尚未被任何人写进航图的地方。",
        rewardSummary: "结局奖励：成长值 +18，资源点 +8",
        rewardDelta: { growth: 18, resources: 8 },
      },
    },
  },
};

function getDungeonStoryline(roleId) {
  return storylines[String(roleId || "").trim()] || storylines.scholar;
}

module.exports = {
  storylines,
  getDungeonStoryline,
};
