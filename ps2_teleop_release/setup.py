from setuptools import setup

package_name = 'ps2_teleop'

setup(
    name=package_name,
    version='1.0.0',
    packages=[package_name],
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='pi',
    maintainer_email='pi@todo.todo',
    description='ROS 2 Python node to control a robot using a PS2 wireless controller connected via GPIO.',
    license='Apache-2.0',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'ps2_teleop_node = ps2_teleop.ps2_teleop_node:main',
        ],
    },
)
