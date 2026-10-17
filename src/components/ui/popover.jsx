import * as Primitive from '@radix-ui/react-popover';
export const Popover = Primitive.Root;
export const PopoverTrigger = Primitive.Trigger;
export function PopoverContent({ children, ...props }) {
  return (
    <Primitive.Portal>
      <Primitive.Content className="popover" sideOffset={12} {...props}>
        {children}
      </Primitive.Content>
    </Primitive.Portal>
  );
}
