import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { UnitsController } from './units.controller';
import type { UnitsService } from './units.service';

describe('UnitsController topology endpoints', () => {
  const getTree = jest.fn();
  const getPath = jest.fn();
  const getNavigationRoots = jest.fn();
  const getNavigationChildren = jest.fn();
  const searchNavigationByCode = jest.fn();
  const getUnitInstantValues = jest.fn();

  const controller = new UnitsController({
    getTree,
    getPath,
    getNavigationRoots,
    getNavigationChildren,
    searchNavigationByCode,
    getUnitInstantValues,
  } as unknown as UnitsService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('anlık değer isteğini URLdeki birim kimliğiyle service katmanına aktarır', async () => {
    const response = { unitId: '10', meters: [] };
    getUnitInstantValues.mockResolvedValueOnce(response);
    await expect(controller.getUnitInstantValues('10')).resolves.toBe(response);
    expect(getUnitInstantValues).toHaveBeenCalledWith('10');
  });

  it('tree isteğini URL parametresindeki id ile service katmanına aktarır', async () => {
    const response = { data: { id: '10' } };
    getTree.mockResolvedValue(response);

    await expect(controller.getTree('10')).resolves.toBe(response);
    expect(getTree).toHaveBeenCalledWith('10');
  });

  it('path isteğini URL parametresindeki id ile service katmanına aktarır', async () => {
    const response = { data: [{ id: '10' }, { id: '20' }] };
    getPath.mockResolvedValue(response);

    await expect(controller.getPath('20')).resolves.toBe(response);
    expect(getPath).toHaveBeenCalledWith('20');
  });

  it('root isteğini parametresiz service metoduna aktarır', async () => {
    const response = { data: [{ id: '10', parentId: null }] };
    getNavigationRoots.mockResolvedValue(response);

    await expect(controller.getNavigationRoots()).resolves.toBe(response);
    expect(getNavigationRoots).toHaveBeenCalledTimes(1);
  });

  it('children isteğinde URL id değerini service katmanına aktarır', async () => {
    const response = { parentId: '10', data: [{ id: '20' }] };
    getNavigationChildren.mockResolvedValue(response);

    await expect(controller.getNavigationChildren('10')).resolves.toBe(
      response,
    );
    expect(getNavigationChildren).toHaveBeenCalledWith('10');
  });

  it('search query DTO nesnesini service katmanına aktarır', async () => {
    const query = { code: 'TR', limit: '20' };
    const response = { query: 'TR', data: [] };
    searchNavigationByCode.mockResolvedValue(response);

    await expect(controller.searchNavigationByCode(query)).resolves.toBe(
      response,
    );
    expect(searchNavigationByCode).toHaveBeenCalledWith(query);
  });

  it.each([
    ['instant-values', UnitsController.prototype.getUnitInstantValues],
    ['tree', UnitsController.prototype.getTree],
    ['path', UnitsController.prototype.getPath],
    ['roots', UnitsController.prototype.getNavigationRoots],
    ['children', UnitsController.prototype.getNavigationChildren],
    ['search', UnitsController.prototype.searchNavigationByCode],
  ])('%s endpointini üç okuma rolüne de açar', (_name, handler) => {
    /**
     * Guard'ın gerçek kararı @Roles decorator'ının bıraktığı metadata üzerinden
     * verilir. Bu kontrol, viewer rolünün topology okuma uçlarına erişebilmesini
     * ve uçların yanlışlıkla yalnızca admin'e kapanmamasını güvenceye alır.
     */
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([
      'admin',
      'operator',
      'viewer',
    ]);
  });
});
