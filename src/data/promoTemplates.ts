/**
 * AI 포스터/홍보물 생성 템플릿과 스타일 프롬프트 조립.
 * 템플릿마다 다른 부분(색·서체·일러스트·톤)만 적고, 공통 문장은 buildStylePrompt()가 채웁니다.
 */

export type PromoOutputFormat = 'poster' | 'slide';

export interface StyleSpec {
    /** 예: 'Infographic / Isometric / Data' */
    style: string;
    colors: {
        background: string;
        text: string;
        accent: string;
        /** 색채 운용 원칙(기본: 개성 + 명료함). */
        note?: string;
    };
    typography: {
        title: string;
        body?: string;
        structure?: string;
        numbers?: string;
    };
    /** 레이아웃 첫 줄(기본: 정보 위계). */
    layout?: string;
    illustration: {
        main: string;
        shapes?: string;
        texture?: string;
        motifs?: string;
        guide?: string;
    };
    dataViz?: {
        emphasis?: string;
        note?: string;
    };
    tone: string[];
    /** 톤 목록 뒤 첫 공통 문장을 대신할 문장. */
    tonePresence?: string;
}

export interface PromoTemplate {
    id: string;
    title: string;
    desc: string;
    category: 'infographic' | 'illustration' | 'notebook' | 'manga' | 'art';
    badge: string;
    tags: string[];
    gradient: string;
    image?: string;
    /** 템플릿을 열 때 기본으로 선택되는 결과물 형태. 사용자가 바꿀 수 있습니다. */
    defaultFormat: PromoOutputFormat;
    style: StyleSpec;
}

const NOTE_DEFAULT = '스타일의 개성을 살리면서도 정보 전달물로서의 명료함과 차분함을 유지한다.';
const NOTE_FRIENDLY = '색채는 친근함을 주되 기업 자료로서의 정돈감은 잃지 않는다.';
const GUIDE_DEFAULT = '도해는 스타일의 개성을 드러내되 주제 이해를 보조하는 역할에 머문다.';
const GUIDE_SOFT = '부드러운 형태를 써도 좋지만 화면이 유치하게 보이지 않도록 조절한다.';
const DATA_NOTE_DEFAULT = '스타일의 개성을 남기면서도 핵심이 빠르게 읽히도록 만든다.';
const DATA_NOTE_FRIENDLY = '친근한 형태를 허용하되 설명의 흐름은 명료하게 유지한다.';

const SLIDE_BLOCK = `### 결과물 형태: 발표용 슬라이드 1장
- 타이틀 슬라이드
  - 상단에 제목, 주변에 작은 보조 정보, 중앙 또는 오른쪽에 상징 비주얼을 둘 수 있다
- 개요 슬라이드
  - 왼쪽에 큰 핵심 헤드라인, 오른쪽에 요약문이나 보조 데이터를 둘 수 있다
- 비교표 슬라이드
  - 상단에 비교 주제, 중앙에 비교표, 하단에 짧은 시사점을 둘 수 있다
- 데이터 정리 슬라이드
  - 상단에 주요 수치, 중단에 차트, 하단에 요점이나 주석을 둘 수 있다
- 흐름 또는 구조 정리 슬라이드
  - 좌우 또는 상하 흐름으로 관계를 정리하고 연결선과 화살표는 절제해 사용한다
- 출력 시에는 위 유형 중 하나를 선택해 완성된 1페이지 슬라이드로 정리한다`;

const POSTER_BLOCK = `### 결과물 형태: 한 장짜리 포스터·안내문
- 슬라이드나 발표 자료 형식으로 만들지 않는다
- 가장 큰 제목으로 핵심 메시지를 먼저 보여 준다
- 일시, 장소, 대상, 신청·문의 방법 등 입력된 정보는 빠짐없이 읽기 쉽게 배치한다
- 입력에 없는 날짜·연락처·수치는 새로 만들어 넣지 않는다
- 인쇄하거나 게시판에 붙였을 때 멀리서도 읽히는 글자 크기와 대비를 확보한다`;

export const OUTPUT_FORMAT_LABELS: Record<PromoOutputFormat, string> = {
    poster: '포스터·안내문',
    slide: '발표 슬라이드',
};

/** 템플릿 스타일 명세 + 결과물 형태로 이미지 생성용 스타일 가이드를 조립합니다. */
export function buildStylePrompt({ format, ...spec }: StyleSpec & { format: PromoOutputFormat }): string {
    const { colors, typography, illustration, dataViz } = spec;
    const lines = (items: string[]) => items.map(item => `- ${item}`).join('\n');
    return [
        `## 비주얼 스타일: ${spec.style}`,
        `### 색상 구성\n${lines([
            `배경: ${colors.background}`,
            `주 텍스트 색상: ${colors.text}`,
            `강조 색상: ${colors.accent}`,
            colors.note || NOTE_DEFAULT,
        ])}`,
        `### 타이포그래피\n${lines([
            `제목: ${typography.title}`,
            `본문: ${typography.body || '읽기 쉬운 본문 서체'}`,
            `구조: ${typography.structure || '제목과 본문의 역할이 분명한 구조'}`,
            `숫자 표현: ${typography.numbers || '중요한 수치는 정보의 축으로 읽히도록 정리한다'}`,
        ])}`,
        `### 레이아웃 그리드\n${lines([
            spec.layout || '정보의 위계가 한눈에 읽히는 구성을 만든다',
            '여백은 단순한 빈칸이 아니라 품위와 가독성을 높이는 요소로 다룬다',
            '정렬은 단정하게 유지하되 지나치게 기계적으로 보이지 않게 한다',
            '여러 페이지 목록, 컨택트시트, 썸네일 그리드처럼 보이게 하지 않는다',
        ])}`,
        `### 일러스트 스타일\n${lines([
            illustration.main,
            illustration.shapes || '형태 언어는 일관되게 유지한다',
            illustration.texture || '질감과 패턴은 절제된 보조 요소로만 사용한다',
            illustration.motifs || '입력 주제에 포함된 모티프만 조용하게 시각화한다',
            illustration.guide || GUIDE_DEFAULT,
            '기업 자료에 부적절한 상징성이 강한 의장은 피한다',
        ])}`,
        `### 데이터 비주얼라이제이션\n${lines([
            '표, 도식, 핵심 포인트를 질서 있게 정리한다',
            dataViz?.emphasis || '강조는 최소화하고 읽는 속도를 우선한다',
            dataViz?.note || DATA_NOTE_DEFAULT,
            '라벨, 제목, 수치의 관계가 즉시 읽히도록 배치한다',
        ])}`,
        format === 'slide' ? SLIDE_BLOCK : POSTER_BLOCK,
        `### 톤 & 보이스\n${lines([
            ...spec.tone,
            spec.tonePresence || '화면 전체에 절제된 존재감과 세련됨을 부여한다',
            '스타일이 주제보다 앞서 보이지 않도록 한다',
            '과하게 튀지 않지만 기억에 남는 인상을 지향한다',
        ])}`,
    ].join('\n\n');
}

const templateImage = (fileName: string) => `${import.meta.env.BASE_URL}templates/${fileName}`;

export const PROMO_TEMPLATES: PromoTemplate[] = [
    {
        id: 't1',
        title: '신뢰의 데이터 인포그래픽',
        desc: '아이소메트릭 구조와 정밀한 수치 비교를 위한 비즈니스 최적화 디자인입니다.',
        category: 'infographic',
        badge: 'Infographic',
        tags: ['#수치중심', '#아이소메트릭', '#비즈니스'],
        gradient: 'from-blue-100 to-indigo-100',
        image: templateImage('T1.png'),
        defaultFormat: 'slide',
        style: {
            style: 'Infographic / Isometric / Data',
            colors: {
                background: '라이트 그레이(#F5F5F5) 또는 화이트',
                text: '다크 그레이',
                accent: '정보 카테고리별 컬러 코딩(블루, 그린, 오렌지)',
                note: '색채는 수치 비교가 빠르게 읽히도록 대비를 확보하고 정량 인지성을 우선한다.',
            },
            typography: {
                title: '신뢰할 수 있는 산세리프(Helvetica, Roboto).',
                body: '작지만 읽기 쉬운 폰트.',
                numbers: '데이터 값을 강조하는 크고 볼드한.',
            },
            illustration: {
                main: '등각투상 도시 또는 공장, 파이프라인, 플로우차트',
                shapes: '3D 아이콘, 화살표, 그래프',
                texture: '매트 벡터',
                guide: '장식적 일러스트보다 카드, 그리드, 구조 도식을 우선한다.',
            },
            dataViz: { note: '도표는 비교, 변화, 규모가 한눈에 읽히도록 설계한다.' },
            tone: ['지적', '명확함', '비즈니스', '교육적'],
        },
    },
    {
        id: 't2',
        title: '모던 코퍼레이트 멤피스',
        desc: '친근한 플랫 일러스트와 멤피스 패턴이 결합된 감각적인 기업용 디자인입니다.',
        category: 'illustration',
        badge: 'Flat Illustration',
        tags: ['#친근함', '#테크스타일', '#멤피스'],
        gradient: 'from-pink-100 to-rose-100',
        image: templateImage('T2.png'),
        defaultFormat: 'poster',
        style: {
            style: 'Flat illustration / Corporate / Memphis',
            colors: {
                background: '화이트 또는 매우 연한 파스텔 그레이.',
                text: '#3B5998 (코퍼레이트 블루)',
                accent: '#FF6B6B (액센트 레드), #FFD93D (액센트 옐로우), #6C5CE7 (소프트 퍼플)',
                note: NOTE_FRIENDLY,
            },
            typography: {
                title: '오픈 산스, 로보토 또는 모던 기하학적 산세리프.',
                structure: '깔끔함, 가독성 중심, 미디엄 웨이트.',
            },
            layout: '균형 잡힌, 삼등분 법칙, 충분한 여백',
            illustration: {
                main: '장난기 있는 멤피스 패턴을 활용한 플랫 벡터, 현대적 테크 회사 스타일.',
                shapes: '물결선, 점, 삼각형, 유기적 블롭(멤피스 요소).',
                motifs: '큰 팔다리의 플랫 피규어, 단순화된 오브젝트, 벡터 씬.',
                guide: GUIDE_SOFT,
            },
            dataViz: { note: DATA_NOTE_FRIENDLY },
            tone: ['친근함', '전문적', '신뢰할 수 있는', '현대적', '포용적'],
        },
    },
    {
        id: 't3',
        title: '블루 잉크 브레인스토밍',
        desc: '노트 위에 끄적인 듯한 블루 잉크 펜 스타일의 창의적인 레이아웃입니다.',
        category: 'notebook',
        badge: 'Doodle',
        tags: ['#손글씨', '#아이디어', '#캐주얼'],
        gradient: 'from-blue-50 to-slate-100',
        image: templateImage('T3.png'),
        defaultFormat: 'poster',
        style: {
            style: 'Doodle / Notebook / Blue Ink',
            colors: {
                background: '줄 긋기 노트 종이 또는 모눈종이.',
                text: '#0000CD (파란 볼펜 잉크)',
                accent: '#FF0000 (빨간 수정 잉크), #FFFFFF (종이)',
            },
            typography: { title: '손글씨 폰트.', structure: '지저분함, 끄적임, 밑줄.' },
            layout: '여백 주석 스타일, 자유 형식, 브레인스토밍 스타일',
            illustration: {
                main: '줄 긋기 종이 위에 그린, 캐주얼 손글씨 미학.',
                motifs: '막대 인간, 별, 화살표, 커피 얼룩.',
            },
            tone: ['창의적', '러프', '개인적', '브레인스토밍', '진정성'],
        },
    },
    {
        id: 't4',
        title: '컬러풀 아이소메트릭 플로우',
        desc: '밝고 생동감 넘치는 컬러와 구조화된 흐름을 보여주는 인포그래픽 디자인입니다.',
        category: 'infographic',
        badge: 'Isometric',
        tags: ['#컬러풀', '#흐름도', '#모던'],
        gradient: 'from-teal-100 to-emerald-100',
        image: templateImage('T4.png'),
        defaultFormat: 'slide',
        style: {
            style: 'Infographic / Isometric / Colorful',
            colors: {
                background: '라이트 그레이 또는 희미한 그리드.',
                text: '#FF6B6B (레드)',
                accent: '#4ECDC4 (틸), #FFE66D (옐로우), #1A535C (다크 블루)',
            },
            typography: { title: '라운드 산세리프.', structure: '명확한 계층, 라벨.' },
            layout: '구조화된 흐름, 상호연결된 요소, 명확한 경로',
            illustration: {
                main: '3D 등각투상 벡터 일러스트레이션을 사용한 데이터 시각화 초점.',
                shapes: '등각투상 그래프, 원형 그래프, 플로우차트 커넥터.',
                motifs: '미니 사람들, 떠다니는 플랫폼, 아이콘.',
            },
            tone: ['정보적', '장난기', '명확함', '프로페셔널', '모던'],
        },
    },
    {
        id: 't5',
        title: '빈티지 칠판 아카이브',
        desc: '어두운 칠판 위에 초크로 그린 듯한 클래식하고 핸드메이드한 감성의 디자인입니다.',
        category: 'art',
        badge: 'Chalk Art',
        tags: ['#아날로그', '#교육적', '#칠판'],
        gradient: 'from-slate-700 to-slate-900',
        image: templateImage('T5.png'),
        defaultFormat: 'poster',
        style: {
            style: 'Handwritten / Chalk / Casual',
            colors: {
                background: '#2F4F4F (다크 슬레이트 그레이) - 칠판 색상.',
                text: '#FFFFFF (화이트) - 초크.',
                accent: '#FF6347 (토마토), #FFD700 (옐로우)',
            },
            typography: { title: '핸드 레터링 스타일 폰트.', structure: '불규칙한 크기와 기울기.' },
            layout: '프리핸드의 자유로운 레이아웃',
            illustration: {
                main: '칠판 아트나 손글씨 메뉴 스타일.',
                shapes: '손그림 일러스트나 장식 테두리.',
            },
            tone: ['친근함', '핸드메이드', '카페', '일상', '소박'],
        },
    },
    {
        id: 't6',
        title: '순정 만화 판타지',
        desc: '70-80년대 소녀 만화의 반짝임과 감성을 담은 로맨틱한 정보 전달 디자인입니다.',
        category: 'manga',
        badge: 'Shoujo Manga',
        tags: ['#반짝임', '#감성적', '#스토리'],
        gradient: 'from-purple-50 to-pink-100',
        image: templateImage('T6.png'),
        defaultFormat: 'poster',
        style: {
            style: 'Manga / Shoujo / Sparkle',
            colors: { background: '#FFFFFF (화이트)', text: '#000000 (블랙)', accent: '스크린 톤 그레이.' },
            typography: { title: '둥근 고딕 또는 앤틱체.', structure: '장식적이고 귀여움.' },
            illustration: { main: '70-80년대 소녀 만화 스타일.' },
            dataViz: { emphasis: '배경에 흩날리는 장미, 반짝이는 별.' },
            tone: ['걸리', '사랑', '꿈', '소녀 만화', '반짝임'],
            tonePresence: '로맨틱하고 감정적.',
        },
    },
    {
        id: 't7',
        title: '큐트 스티커 다이어리',
        desc: '귀여운 캐릭터와 형광펜 메모가 가득한 친근하고 따뜻한 낙서 디자인입니다.',
        category: 'notebook',
        badge: 'Cute Doodle',
        tags: ['#스쿨스타일', '#팬시', '#팀워크'],
        gradient: 'from-yellow-50 to-orange-100',
        image: templateImage('T7.png'),
        defaultFormat: 'poster',
        style: {
            style: 'Doodle / Notebook / Cute',
            colors: {
                background: '대학 노트 줄, 모눈종이',
                text: '볼펜 블루, 블랙',
                accent: '형광펜(핑크, 옐로우)',
                note: NOTE_FRIENDLY,
            },
            typography: {
                title: '아웃라인 글자에 해칭으로 그림자를 넣은 손글씨.',
                body: '둥근 문자.',
                numbers: '귀엽게 장식한 숫자.',
            },
            illustration: {
                main: '수업 중 낙서, 막대 인간, 별, 하트, 느슨한 캐릭터',
                shapes: '프리핸드 라인',
                texture: '볼펜 잉크 뭉침',
                guide: GUIDE_SOFT,
            },
            dataViz: { note: DATA_NOTE_FRIENDLY },
            tone: ['귀여움', '학교', '시간 때우기', '팬시'],
        },
    },
    {
        id: 't8',
        title: '레이어드 페이퍼 크래프트',
        desc: '입체적인 그림자와 종이 질감이 느껴지는 따뜻한 수공예 스타일 디자인입니다.',
        category: 'art',
        badge: 'Paper Craft',
        tags: ['#입체감', '#따뜻함', '#수제'],
        gradient: 'from-orange-50 to-amber-100',
        image: templateImage('T8.png'),
        defaultFormat: 'poster',
        style: {
            style: 'Paper Craft / Layered / Shadow',
            colors: {
                background: '파스텔 컬러 색종이',
                text: '종이 오려내기처럼 보이는 글자',
                accent: '보색 색종이',
            },
            typography: {
                title: '오려낸 글자 또는 볼드 라운드 폰트.',
                body: '손글씨 스타일 또는 친근한 산세리프.',
                numbers: '크게 배치된 종이 오려내기.',
            },
            illustration: {
                main: '물리적 그림자가 있는 종이 겹침, 종이 오려내기, 콜라주',
                shapes: '가위로 자른 가장자리, 레이어',
                texture: '색종이의 거친 느낌, 약간의 두께',
            },
            tone: ['따뜻함', '공예적', '동화 같은', '입체적'],
        },
    },
    {
        id: 't9',
        title: '임팩트 소년 만화',
        desc: '강렬한 잉크 터치와 스크린 톤으로 역동적인 에너지를 전달하는 만화 디자인입니다.',
        category: 'manga',
        badge: 'Action Manga',
        tags: ['#강렬함', '#흑백에너지', '#임팩트'],
        gradient: 'from-gray-100 to-zinc-200',
        image: templateImage('T9.png'),
        defaultFormat: 'poster',
        style: {
            style: 'Manga / Screen Tone / Action',
            colors: {
                background: '#FFFFFF (화이트)',
                text: '#000000 (잉크 블랙)',
                accent: '없음 (또는 효과음에 레드).',
            },
            typography: { title: '주제를 단정하게 보여 주는 제목 서체' },
            illustration: { main: '스타일의 개성을 전달하는 도해와 시각 요소를 사용한다' },
            tone: ['만화', '임팩트', '일본', '스토리', '흑백'],
        },
    },
    {
        id: 't10',
        title: '스페이스 빈티지 콜라주',
        desc: '코믹북 아트와 아메리칸 빈티지 감성이 조화된 폭발적인 임팩트의 디자인입니다.',
        category: 'illustration',
        badge: 'Vintage Collage',
        tags: ['#에너제틱', '#레트로', '#팝아트'],
        gradient: 'from-yellow-100 to-red-100',
        image: templateImage('T10.png'),
        defaultFormat: 'poster',
        style: {
            style: 'Collage / Space / Vintage',
            colors: {
                background: '#FFFF00 (옐로우)',
                text: '#000000 (블랙)',
                accent: '#FF0000 (레드), #0000FF (블루)',
            },
            typography: { title: '코믹북 폰트.', structure: '말풍선에 넣거나 의성어 스타일.' },
            illustration: { main: '아메리칸 코믹 스타일 포스터 아트.' },
            tone: ['대중적', '상업적', '임팩트', '아메리칸', '에너제틱'],
        },
    },
];

const CATEGORY_LABELS: { id: 'all' | PromoTemplate['category']; label: string }[] = [
    { id: 'all', label: '전체' },
    { id: 'infographic', label: '인포그래픽' },
    { id: 'illustration', label: '일러스트' },
    { id: 'notebook', label: '노트/낙서' },
    { id: 'manga', label: '만화/코믹' },
    { id: 'art', label: '아트/공예' },
];

/** 분류별 개수는 템플릿 목록에서 계산합니다(하드코딩 금지). */
export const PROMO_CATEGORIES = CATEGORY_LABELS.map(category => ({
    ...category,
    count: category.id === 'all'
        ? PROMO_TEMPLATES.length
        : PROMO_TEMPLATES.filter(template => template.category === category.id).length,
}));
