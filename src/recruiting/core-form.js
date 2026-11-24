const field = (id, label, type = 'short', options = {}) => ({ id, label, type, required: true, ...options });
const paragraph = (id, label, hint, words) => field(id, label, 'long', { hint, words });
const choice = (id, label, options, hint) => field(id, label, 'choice', { options, hint });

export const coreForm = {
  slug: 'core-team-upc',
  title: 'Forma parte del Core Team',
  description: 'El Core Team organiza actividades de aprendizaje y comunidad. Buscamos alrededor de tres personas con iniciativa, compromiso y ganas de ayudar a otros estudiantes de la UPC. Puedes postular aunque estés empezando con AWS. Tiempo estimado: 20–25 minutos.',
  sections: [
    { title: 'Sobre ti', hint: 'Usaremos estos datos para gestionar esta convocatoria.', fields: [
      field('name', 'Nombres y apellidos'),
      field('email', 'Correo de contacto (preferentemente institucional)', 'email'),
      field('program_cycle', 'Carrera y ciclo académico actual'),
      choice('participation', '¿Qué tipo de participación buscas?', [
        'Quiero postular al Core Team y participar en la organización.',
        'Prefiero ser miembro/asistente y participar en las actividades.',
        'Aún estoy explorando y quisiera conocer mejor ambas opciones.',
      ], 'Las plazas corresponden al Core Team. También valoramos el interés en ser miembro.'),
    ] },
    { title: 'Motivación e iniciativa', fields: [
      paragraph('motivation', '¿Por qué quieres formar parte del Core Team y no únicamente asistir a los eventos?', '¿Qué te gustaría aportar a otros estudiantes?', 120),
      paragraph('initiative', 'Cuéntanos algo que hayas iniciado sin que nadie te lo pidiera.', '¿Qué necesidad viste, qué hiciste primero, qué pasó y qué aprendiste? Puede ser en cualquier contexto.', 150),
      paragraph('responsibility', 'Describe una responsabilidad que se te complicó o que no pudiste cumplir como esperabas.', '¿Cómo lo comunicaste, cómo redujiste el impacto y qué harías distinto?', 120),
      paragraph('learning', '¿Qué has aprendido por curiosidad o iniciativa propia últimamente?', 'Cuenta cómo empezaste y qué hiciste con lo aprendido. Puede ser de cualquier tema.', 100),
    ] },
    { title: 'Situaciones reales', hint: 'Imagina que ya eres parte del equipo.', fields: [
      paragraph('case_speaker', 'Caso A. Un expositor cancela cuatro días antes de un taller AWS con 40 inscritos.', 'Tienes 45 minutos para coordinar una primera respuesta. ¿Cuáles serían tus tres primeras acciones? ¿Qué comunicarías y cómo decidirías entre adaptar o reprogramar?', 150),
      paragraph('case_delivery', 'Caso B. Una persona del equipo deja de responder y falta su entregable para un anuncio.', 'Quedan 24 horas y tú también tienes tareas pendientes. ¿Cómo desbloquearías la situación cuidando el trabajo en equipo?', 120),
    ] },
    { title: 'Compromiso realista', fields: [
      choice('hours', '¿Cuánto tiempo podrías dedicar normalmente, fuera de las fechas de evento?', [
        'Menos de 1 hora por semana.', 'Entre 1 y 2 horas por semana.', 'Entre 2 y 3 horas por semana.',
        'Entre 3 y 5 horas por semana.', 'Mi disponibilidad varía mucho según la semana.',
      ]),
      choice('continuity', 'Pensando en los próximos tres meses, ¿qué continuidad podrías asumir?', [
        'Puedo asumir tareas y reuniones puntuales que se acuerden con anticipación.',
        'Puedo contribuir, preferentemente de forma asíncrona.',
        'Podría hacerlo, pero tengo restricciones que quisiera comentar.',
        'Por ahora no puedo comprometerme con organización; prefiero ser miembro.',
      ]),
      paragraph('exams', 'Si una tarea acordada coincide con exámenes o una entrega importante, ¿qué harías?', 'Explica cuándo avisarías, qué alternativa propondrías y cómo cuidarías al equipo.', 100),
      field('interests', '¿Qué tres frentes te interesaría asumir más?', 'multi', { max: 3, options: [
        'Logística, registro y ejecución de eventos.',
        'Coordinación con ponentes, mentores o aliados.',
        'Diseño de actividades y contenidos para principiantes.',
        'Difusión, redes sociales y comunicación.',
        'Talleres, demos y soporte técnico (con aprendizaje previo si es necesario).',
        'Seguimiento de tareas, documentación y mejora del grupo.',
      ] }),
    ] },
    { title: 'Tu aporte y aprendizaje', fields: [
      paragraph('proposal', 'Propón una actividad pequeña que el grupo podría realizar en los próximos 30 días.', '¿A quién ayudaría, qué aprenderían, cuál sería el formato y qué harías primero?', 150),
      choice('aws', '¿Cuál es tu familiaridad actual con AWS?', [
        'Recién estoy descubriéndolo.', 'Conozco conceptos o he seguido tutoriales.',
        'He realizado laboratorios, proyectos o formaciones.', 'Tengo experiencia práctica amplia o certificaciones.',
      ], 'Sirve para acompañarte y asignar tareas. Puedes postular con cualquier nivel.'),
      field('experience', '¿Has participado en proyectos, voluntariados, eventos o comunidades?', 'long', {
        required: false, hint: 'Si quieres, menciona qué hiciste o comparte un enlace. Puedes dejarlo en blanco.',
      }),
      field('profiles', '¿Tienes LinkedIn, GitHub o un portafolio que quieras compartir?', 'links', {
        required: false, hint: 'Comparte los enlaces que quieras. Tener perfiles públicos es opcional.',
      }),
    ] },
    { title: 'Cierre', fields: [
      field('commitment', 'Entiendo que el Core Team supone acordar tareas, comunicar a tiempo mis límites y colaborar con respeto.', 'check'),
      field('consent', 'Acepto que el equipo organizador use mis respuestas y mi correo únicamente para evaluar mi postulación y comunicarse conmigo sobre este proceso.', 'check'),
    ] },
  ],
};
