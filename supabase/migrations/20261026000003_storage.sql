-- Fotos das batidas: bucket privado. Caminho do arquivo: <usuario_id>/<id_cliente>.jpg
insert into storage.buckets (id, name, public)
values ('fotos-ponto', 'fotos-ponto', false)
on conflict (id) do nothing;

create policy fotos_enviar_propria on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos-ponto' and (storage.foldername(name))[1] = auth.uid()::text);

create policy fotos_ler on storage.objects for select to authenticated
  using (bucket_id = 'fotos-ponto' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or (public.sou_gestor() and exists (
      select 1 from public.usuarios u
      where u.id::text = (storage.foldername(name))[1] and u.empresa_id = public.minha_empresa()))
  ));
