-- Script SQL para agregar la columna 'numero' a la tabla usuarios

ALTER TABLE usuarios 
ADD COLUMN numero VARCHAR(20) NULL AFTER email;

-- Verificar que se agregó correctamente
DESCRIBE usuarios;
