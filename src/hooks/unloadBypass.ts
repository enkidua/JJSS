/**
 * 미저장 보호를 건너뛰고 화면을 다시 불러와야 할 때(백업 복원 성공 직후)를 표시한다.
 *
 * 복원이 끝나면 화면에 남은 입력은 모두 복원 전 상태다. 이때 "저장하지 않은 내용이 있습니다" 확인창에서
 * '계속 작성'을 고르면 복원 전 상태로 앱이 계속 돌아가 다음 자동 저장이 복원 데이터를 덮게 된다.
 * 그래서 복원 직후의 다시 불러오기는 확인 없이 진행한다(저장소는 이미 봉인되어 남은 입력은 저장될 수 없다).
 */
let bypassed = false;

export function allowUnloadWithoutPrompt(): void {
    bypassed = true;
}

export function isUnloadPromptBypassed(): boolean {
    return bypassed;
}
