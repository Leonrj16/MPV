-- Dirección de entrega del pedido, capturada en el checkout de la tienda
-- (public/carrito.html). Nullable: sigue siendo opcional, como el nombre y
-- el teléfono — el pedido también viaja completo por WhatsApp, esto solo
-- lo deja visible en el panel interno sin depender de leer el chat.
ALTER TABLE pedidos_web ADD COLUMN direccion VARCHAR(255);
