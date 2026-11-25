import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import AssessmentIcon from '@mui/icons-material/Assessment';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import HomeIcon from '@mui/icons-material/Home';
import ManageSearchIcon from '@mui/icons-material/ManageSearch';
import PeopleIcon from '@mui/icons-material/People';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import type { SvgIconComponent } from '@mui/icons-material';

export interface NavItem {
  label: string;
  /** Route without basePath; static export uses trailing slashes. */
  href: string;
  icon: SvgIconComponent;
}

/** Main menu. Each entry maps to a folder under src/app/(app)/. */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Inicio', href: '/', icon: HomeIcon },
  { label: 'Viajes', href: '/viajes/', icon: FlightTakeoffIcon },
  { label: 'Gastos', href: '/gastos/', icon: ReceiptLongIcon },
  { label: 'Clientes', href: '/clientes/', icon: PeopleIcon },
  { label: 'Pedidos', href: '/pedidos/', icon: ManageSearchIcon },
  { label: 'Ventas', href: '/ventas/', icon: ShoppingBagIcon },
  { label: 'Reportes', href: '/reportes/', icon: AssessmentIcon },
  { label: 'Monedas', href: '/monedas/', icon: AttachMoneyIcon },
];

/** True when `pathname` (from usePathname, without basePath) is inside the item's section. */
export function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === '/') return pathname === '/';
  return pathname === item.href || pathname.startsWith(item.href) || `${pathname}/` === item.href;
}
