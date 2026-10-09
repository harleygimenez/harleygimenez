import { router } from 'expo-router';

import { CalculadoraPrazo } from '../components/CalculadoraPrazo';
import { Tela } from '../components/ui';

export default function Calculadora() {
  return (
    <Tela>
      <CalculadoraPrazo
        rotuloAplicar="Criar prazo nesta data"
        aoAplicar={(data) => router.push(`/compromisso/form?tipo=prazo&data=${data}`)}
      />
    </Tela>
  );
}
