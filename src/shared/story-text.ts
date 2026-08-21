export function countChineseCharacters(value: string): number {
  return value.match(/\p{Script=Han}/gu)?.length ?? 0
}
