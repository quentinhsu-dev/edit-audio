/**
 * 保留小数的函数
 * @param num - 需要处理的数字
 * @param decimalPlaces - 小数位数，最低可设置为 0
 * @param round - 是否进行四舍五入，默认是 false
 * @returns 处理后的数字
 */
export function preserveDecimals(
  num: number,
  decimalPlaces = 2,
  round = false,
): number {
  // 根据 decimalPlaces 计算乘数
  const factor: number = 10 ** decimalPlaces;

  // 根据 round 的值，决定是截取还是四舍五入
  if (round) {
    return Math.round(num * factor) / factor; // 四舍五入
  }
  return Math.floor(num * factor) / factor; // 截取，向下取整
}
