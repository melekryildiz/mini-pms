module.exports = async function () {
  /**
   * E2E testi başlamadan önce var olan Unit Service'i sahiplenmez.
   * Bu nedenle teardown sırasında porttaki herhangi bir süreci öldürmek güvenli
   * değildir; geliştiricinin elle başlattığı servis çalışmaya devam eder.
   * Test verisinin temizliği ilgili spec'in afterAll bloğunda yapılır.
   */
  console.log(globalThis.__TEARDOWN_MESSAGE__);
};
